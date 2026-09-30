import {readFile,writeFile} from 'node:fs/promises';
import webpush from 'web-push';
const path='.env.local';
let content=await readFile(path,'utf8');
if(/^VAPID_PUBLIC_KEY=.+$/m.test(content)||/^VAPID_PRIVATE_KEY=.+$/m.test(content)) {
 console.log('Push keys already exist; left unchanged.');
} else {
 const keys=webpush.generateVAPIDKeys();
 content=content.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=.*\r?\n?/gm,'');
 await writeFile(path,content+`\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
 console.log('Push keys saved in .env.local without displaying them. Copy both to Railway Variables.');
}
