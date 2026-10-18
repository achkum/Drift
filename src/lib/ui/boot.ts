// Shared by the server layout (inline script) and client prefs. No 'use client' here.
export const THEME_KEY = 'drift-theme';
export const ONBOARDED_KEY = 'drift-onboarded';
export const AUDIENCE_KEY = 'drift-audience';

/**
 * Runs in <head> before first paint: sets data-theme and data-onboarded on <html>
 * so there is no flash of the wrong theme or of onboarding-only UI.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;var p='system';try{p=localStorage.getItem('${THEME_KEY}')||'system';}catch(e){}var dark=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);d.setAttribute('data-theme',dark?'dark':'light');try{if(localStorage.getItem('${ONBOARDED_KEY}')==='1')d.setAttribute('data-onboarded','');}catch(e){}})();`;
