/* 入口：画面を登録して起動する */
import { boot } from './app.js';
import './home.js';
import './project.js';
import './pages.js';

boot();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('オフライン用の登録に失敗しました', e));
  });
}
