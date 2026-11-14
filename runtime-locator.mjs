import {statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function isFile(file){try{return !!file&&statSync(file).isFile();}catch{return false;}}
function which(name){
  const result=spawnSync(process.platform==='win32'?'where.exe':'which',[name],{encoding:'utf8',windowsHide:true,timeout:5000});
  return result.status===0?result.stdout.trim().split(/\r?\n/).filter(isFile):[];
}
// Optional override for a custom browser location.
const browserOverride=env=>env.DEBATE_BUDDY_BROWSER_PATH||env.DEBATE_BUDDY_CHROME_PATH||'';
export function chromeCandidates({platform=process.platform,env=process.env,home=os.homedir(),lookup=which}={}){
  const files=[];
  const override=browserOverride(env);if(override)files.push(override);
  if(platform==='win32'){
    files.push(...lookup('chrome.exe'));
    for(const base of [env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean))files.push(path.join(base,'Google','Chrome','Application','chrome.exe'));
    for(const base of [env['PROGRAMFILES(X86)'],env.PROGRAMFILES].filter(Boolean))files.push(path.join(base,'Microsoft','Edge','Application','msedge.exe'));
  }else if(platform==='darwin'){
    files.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',path.join(home,'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  }else for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser','microsoft-edge'])files.push(...lookup(name));
  return [...new Set(files.filter(Boolean))];
}
export function resolveChrome(options={}){return chromeCandidates(options).find(isFile)||null;}
// On macOS a browser is opened through its .app bundle so an already running copy gets a new tab.
export function appBundleOf(file){const match=/^(.*?\.app)\/Contents\/MacOS\//.exec(file||'');return match?match[1]:null;}
