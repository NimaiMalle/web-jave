# Agent Instructions

> Copy this file to your project as `AGENTS.md` or append to your existing `CLAUDE.md`

## Nucleo Icons CLI

This project has access to the [Nucleo](https://nucleoapp.com/) icon library (51,000+ icons) via the `nucleo` CLI.

### Quick Reference

```bash
# Search for icons - searches names, tags, sets, and styles automatically
nucleo search "arrow"
nucleo search "download"
nucleo search "arcade game"        # finds game icons in Nucleo Arcade
nucleo search "flags usa"          # finds USA flag in Nucleo Flags

# Exclude terms with - prefix
nucleo search "arrow -circle"      # arrows without "circle"
nucleo search "user -avatar"       # users without "avatar"

# Show all style variants with paths (for copying specific variant)
nucleo search "download" --expand

# Copy an icon SVG to the project
nucleo copy "arrow-right" ./src/assets/icons
nucleo copy "download" ./public/icons --output download-icon.svg

# Copy specific style variant (important when icon exists in multiple styles!)
nucleo copy "download" --group arcade ./icons    # get Arcade version
nucleo copy "download" --group ui ./icons        # get UI version
nucleo copy "download" --group "micro bold"      # get Micro Bold version

# Copy by exact icon ID (from search --expand)
nucleo copy --id 315 ./icons

# Customize colors for theming / dark mode
nucleo copy "download" --group arcade --color "#ffffff"       # white for dark mode
nucleo copy "download" --group arcade --color currentColor    # CSS-controlled
nucleo copy "download" --color "#3B82F6" --secondary "#93C5FD"  # custom duotone

# Export as PNG (transparent background)
nucleo copy "download" --png                  # 64x64 PNG
nucleo copy "download" --png --size 128       # 128x128 PNG

# Output to stdout (for piping or inline use)
nucleo copy "download" --stdout               # SVG to stdout
nucleo copy "download" --png --stdout         # PNG to stdout

# Preview an icon in the terminal
nucleo preview "arrow-right"

# List all icon sets and style groups
nucleo sets
nucleo sets --groups

# Interactive browser (if user wants to explore)
nucleo browse

# Fuzzy search with fzf (if installed)
nucleo fzf --query "arrow"
```

### Workflow

When the user asks for icons:

1. **Search** for relevant icons (results are clustered by name, ranked by relevance):
   ```bash
   nucleo search "shopping cart"
   ```
   Output shows unique icons with available styles:
   ```
   cart
     Styles: Nucleo UI, Nucleo Core, Nucleo Micro Bold
     Tags: shopping, cart, buy, purchase, ...
   ```

2. **Preview** to verify it's the right one (optional):
   ```bash
   nucleo preview "cart"
   ```

3. **Copy** to the project:
   ```bash
   nucleo copy "cart" ./src/assets/icons
   ```

4. **Import** in code:
   ```tsx
   // React example
   import CartIcon from './assets/icons/cart.svg';
   ```

### Search Tips

- **Natural language works**: Search "arcade recycle" finds trash icons in Nucleo Arcade
- **Negation**: Use `-term` to exclude (e.g., `arrow -bold -circle`)
- **Multi-word**: All terms must match somewhere (e.g., `credit card` finds credit-card icon)
- **Style filtering**: Include style name in query (e.g., `micro bold arrow`) or use `--group` flag

### Icon Styles

Nucleo has different style families - ask the user which they prefer if unclear:

| Style | Best For | Example Query |
|-------|----------|---------------|
| Nucleo UI | Small UI elements (12-18px) | `nucleo search "ui arrow"` |
| Nucleo Core | Medium/large display (24-48px) | `nucleo search "core download"` |
| Nucleo Micro Bold | Tiny with bold strokes (20px) | `nucleo search "micro bold user"` |

Plus specialty collections: Arcade, Credit Cards, Flags, Social Media, and more.

### Tips

- Icon names are kebab-case: `arrow-right`, `shopping-cart`, `user-circle`
- Default limit is 20 results; use `--limit` to adjust
- Use `--expand` to see all style variants with file paths
- The `nucleo copy` command creates the destination directory if needed
- SVG files can be used directly or converted to React/Vue components
