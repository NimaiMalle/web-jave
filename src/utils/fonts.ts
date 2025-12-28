// Dynamic font loading utility

// Cache of loaded font stylesheets to avoid duplicate loads
const loadedFonts = new Set<string>();

/**
 * Attempts to load a font, first checking if it's already available,
 * then trying to load it from Google Fonts.
 *
 * @param fontFamily - The font family name (e.g., "JetBrains Mono")
 * @param fontSize - The font size to test with
 * @returns true if the font is available, false otherwise
 */
export async function loadFont(fontFamily: string, fontSize: number): Promise<boolean> {
  const testString = `${fontSize}px "${fontFamily}"`;

  // Check if already available (system font or previously loaded)
  if (document.fonts.check(testString)) {
    return true;
  }

  // Check if we've already tried loading this font
  const fontKey = fontFamily.toLowerCase();
  if (loadedFonts.has(fontKey)) {
    // Already attempted to load, check if it worked
    return document.fonts.check(testString);
  }

  // Try loading from Google Fonts
  const googleFontName = fontFamily.replace(/ /g, '+');
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFontName)}:wght@400&display=swap`;

  try {
    // Fetch the CSS
    const response = await fetch(fontUrl);
    if (!response.ok) {
      console.warn(`Font "${fontFamily}" not found on Google Fonts`);
      loadedFonts.add(fontKey);
      return false;
    }

    const css = await response.text();

    // Inject the stylesheet
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Wait for the font to actually load
    await document.fonts.load(testString);

    loadedFonts.add(fontKey);
    return document.fonts.check(testString);
  } catch (err) {
    console.warn(`Failed to load font "${fontFamily}":`, err);
    loadedFonts.add(fontKey);
    return false;
  }
}

/**
 * Check if a font is available without attempting to load it
 */
export function isFontAvailable(fontFamily: string, fontSize: number): boolean {
  return document.fonts.check(`${fontSize}px "${fontFamily}"`);
}
