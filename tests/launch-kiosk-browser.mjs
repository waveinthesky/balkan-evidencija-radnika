import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// Real Chromium UI interaction, simulated Firebase responses; never touches live worker records.
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const app='export function initializeApp(config){return {config}}';
 const auth=