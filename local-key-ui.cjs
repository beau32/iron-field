'use strict';
// Loopback-only key entry. No GET endpoint ever returns the key.
const http=require('node:http'),crypto=require('node:crypto');
async function start(commander){
 const nonce=crypto.randomBytes(32).toString('hex');
 let origin;
 const page=message=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Iron Field — OpenAI key setup</title>
 <style>body{background:#14231c;color:#edf4e7;font:17px/1.5 system-ui;margin:8vh auto;padding:24px;max-width:600px}h1{font-size:28px}label{display:block;margin-top:24px}input{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;background:#263b2e;color:white;border:1px solid #90bca1;border-radius:5px}button{padding:12px 18px;background:#a8e9ce;color:#14231c;border:0;border-radius:5px;cursor:pointer}small{color:#b5c7a6}.status{padding:14px;border:1px solid #607e68}</style>
 <h1>OpenAI Decisions setup</h1><p>This page belongs to the Iron Field connector running on your computer.</p>
 <p class="status" role="status">${message}</p><p>Your key stays in this connector's memory until it closes. Game summaries are sent to OpenAI only while OpenAI commander is selected. OpenAI API usage is billed to your account.</p>
 <form method="post" action="/key"><input type="hidden" name="nonce" value="${nonce}"><label for="key">OpenAI API key</label><input id="key" name="key" type="password" required maxlength="512" autocomplete="off" spellcheck="false" placeholder="Paste your API key here"><button>Use key for this session</button></form>
 <form method="post" action="/clear"><input type="hidden" name="nonce" value="${nonce}"><p><button>Forget key</button></p></form><small>No key is saved in the game, on the game server, or in browser storage by this page. Model: gpt-6-luna. Return to the game after saving.</small></html>`;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const send=(status,text)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(text);};
  if(req.headers.host!==new URL(origin).host)return send(403,'Open the connector using its 127.0.0.1 address.');
  if(req.method==='GET'&&req.url==='/')return send(200,page(commander.status().ready?'A key is configured. Access is verified by the next game decision.':'No key configured yet.'));
  if(req.method!=='POST'||!['/key','/clear'].includes(req.url))return send(404,'Not found.');
  if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return send(403,'Open the connector setup page to enter a key.');
  try{
   let body='';for await(const part of req){body+=part;if(body.length>2048)return send(413,'Form too large.');}
   const data=new URLSearchParams(body);
   if(data.get('nonce')!==nonce)return send(403,'Reload the setup page and try again.');
   if(req.url==='/clear')commander.clearKey();else commander.setKey(data.get('key')||'');
   res.writeHead(303,{Location:'/'});res.end();
  }catch{send(400,page('The key was not accepted. Enter it again without spaces.'));}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
 return {server,url:origin+'/',port:server.address().port};
}
module.exports={start};
