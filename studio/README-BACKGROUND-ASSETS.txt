OBITREND Background Studio image assets

1. Extract the supplied ZIP at the root of the OBITREND repository.
2. It places eight JPEGs under studio/assets/.
3. Run: node apply-background-assets.mjs
4. Review the diff before committing. The script updates only the 100
   Background Studio template preview paths in studio/template-catalog.js.

Category mapping:
- Mountains 01 -> mountains-01.jpg
- London Studio 01 -> london-studio-01.jpg
- NYC Rooftop 01 -> nyc-rooftop-01.jpg
- Lagos Street 01 -> lagos-street-01.jpg
- Luxury Villa 01 -> luxury-villa-01.jpg
- Desert 01 -> desert-01.jpg
- Beach 01 -> beach-01.jpg
- Runway 01 -> runway-01.jpg

The script intentionally does not change free/PRO flags, prompts, generation,
authentication, credits, payments, or any production configuration.
