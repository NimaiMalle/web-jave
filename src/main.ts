import { App } from './App.js';

async function main() {
  const app = new App();

  // Try to restore autosaved document, otherwise create default
  const restored = await app.tryLoadAutosave();

  if (!restored) {
    await app.createDocument({
      cols: 40,
      rows: 20,
      fontFamily: 'Consolas',
      fontSize: 16,
      polarity: 'light-on-dark'
    });
  }

  console.log('ASCII Art Editor initialized' + (restored ? ' (restored from autosave)' : ''));
}

main().catch(console.error);
