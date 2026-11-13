"""Train on generated Iron Field decisions; labels are heuristic, not expert play."""
import json, os, random, sys, time
from pathlib import Path
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
import torch
import torch.nn.functional as F
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments

ROOT = Path(__file__).resolve().parent
BASE = ROOT.parent / 'qwen35-9b-rts' / 'base'
PILOT = '--pilot' in sys.argv
OUT = ROOT / ('pilot' if PILOT else 'checkpoints')
FINAL = ROOT / ('pilot-adapter' if PILOT else 'adapter-final')

def main():
    random.seed(42); torch.manual_seed(42); torch.cuda.manual_seed_all(42)
    tokenizer = AutoTokenizer.from_pretrained(BASE, local_files_only=True)
    if tokenizer.pad_token_id is None: tokenizer.pad_token = tokenizer.eos_token
    rows = [json.loads(x) for x in (ROOT / 'train_combined.jsonl').read_text(encoding='utf8').splitlines() if x.strip()]
    data = []
    for row in rows:
        messages = row['messages']
        before = tokenizer.apply_chat_template(messages[:-1], tokenize=True, add_generation_prompt=True, enable_thinking=False)['input_ids']
        full = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False, enable_thinking=False)['input_ids']
        if full[:len(before)] != before or len(full) > 1536 or len(full) <= len(before):
            raise ValueError(f'Unexpected chat format or sequence length: {len(full)}')
        data.append({'input_ids': full, 'attention_mask': [1]*len(full), 'labels': [-100]*len(before)+full[len(before):]})
    print(f'Examples: {len(data)}, tokens min/max: {min(len(x["input_ids"]) for x in data)}/{max(len(x["input_ids"]) for x in data)}', flush=True)
    # Verify causal alignment of suffix-only logits against standard masked loss.
    x = torch.randn(1, 13, 31); y = torch.randint(0,31,(1,13)); y[:,:8] = -100
    a = F.cross_entropy(x[:,:-1,:].reshape(-1,31), y[:,1:].reshape(-1))
    b = F.cross_entropy(x[:,7:-1,:].reshape(-1,31), y[:,8:].reshape(-1))
    assert torch.allclose(a,b)
    config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
    print('Loading 4-bit base...', flush=True)
    text_config = AutoConfig.from_pretrained(BASE, local_files_only=True).text_config
    model, loading = AutoModelForCausalLM.from_pretrained(BASE, config=text_config, local_files_only=True, quantization_config=config, device_map={'':0}, dtype=torch.bfloat16, attn_implementation='eager', key_mapping={r'^model\.language_model\.': 'model.'}, output_loading_info=True)
    if loading['missing_keys'] or loading.get('mismatched_keys'):
        raise RuntimeError('Text weights failed to load: '+str(loading))
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={'use_reentrant':False})
    model = get_peft_model(model, LoraConfig(r=4, lora_alpha=8, lora_dropout=0.05, bias='none', target_modules=r'.*\.(q_proj|v_proj)', task_type='CAUSAL_LM'))
    model.print_trainable_parameters()
    class Examples(torch.utils.data.Dataset):
        def __len__(self): return len(data)
        def __getitem__(self, i): return data[i]
    def collate(batch):
        assert len(batch)==1
        return {k: torch.tensor([batch[0][k]], dtype=torch.long) for k in ('input_ids','attention_mask','labels')}
    class ResponseTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
            labels = inputs.pop('labels')
            start = labels[0].ne(-100).nonzero()[0].item()
            keep = labels.shape[1] - start + 1
            outputs = model(**inputs, use_cache=False, logits_to_keep=keep)
            logits = outputs.logits[:,:-1,:].float().contiguous()
            targets = labels[:,start:].contiguous()
            loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), targets.reshape(-1))
            return (loss, outputs) if return_outputs else loss
    args = TrainingArguments(output_dir=str(OUT), max_steps=4 if PILOT else -1, num_train_epochs=1,
        per_device_train_batch_size=1, gradient_accumulation_steps=1, learning_rate=1e-5,
        lr_scheduler_type='constant', warmup_steps=0, bf16=True, optim='adamw_torch', logging_steps=10 if not PILOT else 1,
        save_strategy='steps', save_steps=200 if not PILOT else 4, save_total_limit=2, report_to=[], dataloader_num_workers=0,
        remove_unused_columns=False, gradient_checkpointing=True, gradient_checkpointing_kwargs={'use_reentrant':False}, seed=42)
    trainer = ResponseTrainer(model=model, args=args, train_dataset=Examples(), data_collator=collate)
    from transformers.trainer_utils import get_last_checkpoint
    resume = None if PILOT else get_last_checkpoint(str(OUT))
    print('Resuming checkpoint: '+str(resume),flush=True)
    start = time.time(); result = trainer.train(resume_from_checkpoint=resume)
    FINAL.mkdir(parents=True, exist_ok=True); trainer.save_model(str(FINAL)); tokenizer.save_pretrained(str(FINAL))
    (ROOT / ('pilot_result.json' if PILOT else 'training_result.json')).write_text(json.dumps({'status':'completed','examples':len(data),'steps':result.global_step,'training_loss':result.training_loss,'seconds':round(time.time()-start,1),'adapter':str(FINAL),'note':'Synthetic rule labels and two weak inferred human observations; training loss is not evidence of game strength.'}, indent=2), encoding='utf8')
    print('Saved:', FINAL, flush=True)
if __name__ == '__main__': main()
