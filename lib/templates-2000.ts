/** OBITREND 2,000-template location catalog.
 * 20 tools × 100 templates. Locations are unique within each tool.
 * Location scenes are reusable across tools; template IDs are globally unique.
 * Preview photos are mapped only where a supplied image visibly matches the location.
 * Other entries use an existing neutral editorial preview until their exact photo is uploaded.
 * UI tier flags are presentation metadata; server-side Paystack entitlement checks remain authoritative.
 */
export type TemplateTier = "free" | "pro";
export interface LocationTemplate {
  id: string;
  toolId: string;
  toolName: string;
  name: string;
  region: string;
  exact_location: string;
  preview: string;
  tier: TemplateTier;
  locked: boolean;
  prompt: string;
}
export interface TemplateToolDefinition { id: string; name: string; free: number; pro: number; templates: LocationTemplate[]; }

const LOCATION_PRESETS = [
  {
    "region": "USA",
    "name": "Times Square Neon Night",
    "exact_location": "Times Square, New York — Broadway at night with illuminated fashion billboards",
    "preview": "/templates/bg/usa-times-square.jpg"
  },
  {
    "region": "USA",
    "name": "SoHo Cast Iron District",
    "exact_location": "SoHo, Manhattan — Greene Street cast-iron façades",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Brooklyn DUMBO Waterfront",
    "exact_location": "DUMBO, Brooklyn — Washington Street and Manhattan Bridge view",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Manhattan Empire State Rooftop",
    "exact_location": "Midtown Manhattan — rooftop terrace facing the Empire State Building",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Williamsburg Waterfront",
    "exact_location": "Domino Park, Williamsburg — East River skyline promenade",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Chelsea High Line",
    "exact_location": "The High Line, Chelsea — elevated garden walkway",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Harlem Brownstone Row",
    "exact_location": "Strivers' Row, Harlem — historic brownstone streetscape",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Central Park Bethesda Terrace",
    "exact_location": "Bethesda Terrace, Central Park — arcade and fountain",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Tribeca Cobblestone Lane",
    "exact_location": "Tribeca, Manhattan — cobblestone street and converted lofts",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Fifth Avenue Luxury Row",
    "exact_location": "Fifth Avenue, Manhattan — flagship luxury storefronts",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Flatiron District Broadway",
    "exact_location": "Flatiron District — Broadway and the Flatiron Building",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Hudson Yards Vessel Plaza",
    "exact_location": "Hudson Yards, Manhattan — public plaza and modern towers",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Rockefeller Center Promenade",
    "exact_location": "Rockefeller Center, Midtown — Channel Gardens promenade",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Grand Central Terminal Hall",
    "exact_location": "Grand Central Terminal, Manhattan — Main Concourse",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Brooklyn Bridge Park Pier",
    "exact_location": "Brooklyn Bridge Park — Pier 1 waterfront",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Coney Island Boardwalk",
    "exact_location": "Coney Island, Brooklyn — boardwalk and beachfront",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Madison Avenue Upper East Side",
    "exact_location": "Madison Avenue, Upper East Side — designer boutiques",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Little Italy Mulberry Street",
    "exact_location": "Mulberry Street, Manhattan — café-lined Little Italy",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Washington Square Arch",
    "exact_location": "Washington Square Park, Greenwich Village — arch and plaza",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "USA",
    "name": "Fifth Avenue Museum Mile",
    "exact_location": "Museum Mile, Upper East Side — Fifth Avenue streetscape",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Big Ben Westminster Golden Hour",
    "exact_location": "Westminster Bridge, London — Big Ben and Parliament at sunset",
    "preview": "/templates/bg/uk-big-ben.jpg"
  },
  {
    "region": "UK",
    "name": "Shoreditch Brick Lane Graffiti",
    "exact_location": "Brick Lane, Shoreditch, London — street-art and creative studio frontage",
    "preview": "/templates/bg/uk-shoreditch.jpg"
  },
  {
    "region": "UK",
    "name": "Notting Hill Pastel Row",
    "exact_location": "Portobello Road, Notting Hill, London — pastel terraced houses",
    "preview": "/templates/bg/uk-notting-hill.jpg"
  },
  {
    "region": "UK",
    "name": "Covent Garden Piazza",
    "exact_location": "Covent Garden, London — historic market piazza",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Mayfair Bond Street",
    "exact_location": "New Bond Street, Mayfair, London — luxury boutiques",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Soho Carnaby Street",
    "exact_location": "Carnaby Street, Soho, London — colourful retail street",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Camden Lock Market",
    "exact_location": "Camden Lock, London — canal-side market",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Southbank Thames Walk",
    "exact_location": "South Bank, London — riverside promenade",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Tower Bridge Riverside",
    "exact_location": "Shad Thames, London — Tower Bridge riverside view",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "St Paul's Millennium Bridge",
    "exact_location": "Millennium Bridge, London — St Paul's Cathedral view",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Kensington Palace Gardens",
    "exact_location": "Kensington Gardens, London — palace approach",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Regent Street Curve",
    "exact_location": "Regent Street, London — grand curved shopping avenue",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "King's Cross Coal Drops Yard",
    "exact_location": "Coal Drops Yard, King's Cross, London — contemporary retail courtyard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Leadenhall Market",
    "exact_location": "Leadenhall Market, City of London — Victorian covered arcade",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Borough Market Passage",
    "exact_location": "Borough Market, Southwark, London — market lanes",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Piccadilly Circus Lights",
    "exact_location": "Piccadilly Circus, London — illuminated central square",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Greenwich Painted Hall",
    "exact_location": "Old Royal Naval College, Greenwich — riverside architecture",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Marylebone High Street",
    "exact_location": "Marylebone High Street, London — village-style boutiques",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Primrose Hill Skyline",
    "exact_location": "Primrose Hill, London — elevated city panorama",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Hampstead Village Lane",
    "exact_location": "Hampstead Village, London — historic high-street scene",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Battersea Power Station",
    "exact_location": "Battersea Power Station, London — riverside redevelopment",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Knightsbridge Sloane Street",
    "exact_location": "Sloane Street, Knightsbridge, London — designer storefronts",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Richmond Riverside",
    "exact_location": "Richmond, London — Thames riverside walk",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Little Venice Canal",
    "exact_location": "Little Venice, Maida Vale, London — canal-side terraces",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "UK",
    "name": "Alexandra Palace Panorama",
    "exact_location": "Alexandra Palace, North London — city-view terrace",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Eiffel Trocadero Sunset",
    "exact_location": "Trocadéro Gardens, Paris — Eiffel Tower view at sunset",
    "preview": "/templates/bg/paris-eiffel.jpg"
  },
  {
    "region": "Paris",
    "name": "Montmartre Sacré-Cœur Steps",
    "exact_location": "Place du Tertre, Montmartre, Paris — artists' square near Sacré-Cœur",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Le Marais Rue de Turenne",
    "exact_location": "Rue de Turenne, Le Marais, Paris — elegant historic façades",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Saint-Germain Café Row",
    "exact_location": "Boulevard Saint-Germain, Paris — classic café terraces",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Champs-Élysées Avenue",
    "exact_location": "Avenue des Champs-Élysées, Paris — grand avenue",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Canal Saint-Martin Footbridge",
    "exact_location": "Canal Saint-Martin, Paris — iron footbridges and waterside cafés",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Louvre Pyramid Night",
    "exact_location": "Cour Napoléon, Louvre, Paris — illuminated glass pyramid",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Pont Alexandre III",
    "exact_location": "Pont Alexandre III, Paris — ornate Seine bridge",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Palais Royal Columns",
    "exact_location": "Colonnes de Buren, Palais-Royal, Paris — courtyard columns",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Paris",
    "name": "Place Vendôme Luxury Square",
    "exact_location": "Place Vendôme, Paris — luxury façades and central column",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Galleria Vittorio Emanuele II",
    "exact_location": "Galleria Vittorio Emanuele II, Milan — Prada and luxury arcade storefronts",
    "preview": "/templates/bg/milan-galleria.jpg"
  },
  {
    "region": "Milan",
    "name": "Duomo Square Milan",
    "exact_location": "Piazza del Duomo, Milan — cathedral square",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Navigli Canal Golden Hour",
    "exact_location": "Naviglio Grande, Milan — canal-side aperitivo district",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Brera Design District",
    "exact_location": "Via Brera, Milan — design district streetscape",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Quadrilatero della Moda",
    "exact_location": "Via Montenapoleone, Milan — fashion district boutiques",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Arco della Pace",
    "exact_location": "Piazza Sempione, Milan — Arco della Pace",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Castello Sforzesco Courtyard",
    "exact_location": "Castello Sforzesco, Milan — historic courtyard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Fondazione Prada Courtyard",
    "exact_location": "Fondazione Prada, Milan — contemporary art architecture",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Porta Nuova Skyline",
    "exact_location": "Piazza Gae Aulenti, Milan — modern skyline",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Milan",
    "name": "Corso Como Evening",
    "exact_location": "Corso Como, Milan — fashion and nightlife street",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Lekki-Ikoyi Bridge Sunset",
    "exact_location": "Lekki-Ikoyi Link Bridge, Lagos — bridge at sunset",
    "preview": "/templates/bg/lagos-bridge.jpg"
  },
  {
    "region": "Lagos",
    "name": "Victoria Island Financial District",
    "exact_location": "Victoria Island, Lagos — modern glass office towers and retail boulevard",
    "preview": "/templates/bg/lagos-business-district.jpg"
  },
  {
    "region": "Lagos",
    "name": "Balogun Market Fashion Lane",
    "exact_location": "Balogun Market, Lagos Island — textile and fashion trading lanes",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Banana Island Palm Avenue",
    "exact_location": "Banana Island, Ikoyi, Lagos — palm-lined luxury residences",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Yaba Street Art Quarter",
    "exact_location": "Yaba, Lagos — creative street-art and fashion-workshop scene",
    "preview": "/templates/bg/lagos-yaba-studio.jpg"
  },
  {
    "region": "Lagos",
    "name": "Eko Atlantic Oceanfront",
    "exact_location": "Eko Atlantic City, Lagos — modern oceanfront boulevard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "National Theatre Waterfront",
    "exact_location": "National Theatre, Iganmu, Lagos — cultural landmark approach",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Tarkwa Bay Beachfront",
    "exact_location": "Tarkwa Bay, Lagos — sandy beach and coastal water",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Lekki Phase One Boulevard",
    "exact_location": "Lekki Phase 1, Lagos — contemporary retail boulevard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Oniru Beach Promenade",
    "exact_location": "Oniru Beach, Victoria Island, Lagos — beachfront promenade",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Freedom Park Lagos",
    "exact_location": "Freedom Park, Lagos Island — heritage courtyard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Nike Art Gallery Exterior",
    "exact_location": "Nike Art Gallery, Lekki, Lagos — art-centre approach",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Terra Kulture Courtyard",
    "exact_location": "Terra Kulture, Victoria Island, Lagos — arts and culture courtyard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Landmark Beach Coastline",
    "exact_location": "Landmark Beach, Victoria Island, Lagos — coastal leisure scene",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Jubilee Bridge Ikoyi",
    "exact_location": "Ikoyi, Lagos — bridge approach and waterfront",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Marina Lagos Island",
    "exact_location": "Marina, Lagos Island — historic business district",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Ikeja City Mall Plaza",
    "exact_location": "Ikeja, Lagos — modern shopping-centre plaza",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Lekki Conservation Canopy",
    "exact_location": "Lekki Conservation Centre, Lagos — elevated canopy walkway",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Elegushi Beach Sunset",
    "exact_location": "Elegushi Beach, Lekki, Lagos — sunset shoreline",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Iga Idungaran Palace Quarter",
    "exact_location": "Iga Idungaran, Lagos Island — historic palace district",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Falomo Bridge Skyline",
    "exact_location": "Falomo, Ikoyi, Lagos — urban bridge and skyline",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Alausa Civic Centre",
    "exact_location": "Alausa, Ikeja, Lagos — civic district boulevard",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Awolowo Road Ikoyi",
    "exact_location": "Awolowo Road, Ikoyi, Lagos — leafy upscale avenue",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Eko Hotel Oceanfront",
    "exact_location": "Eko Hotel, Victoria Island, Lagos — hotel forecourt and ocean view",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Lagos",
    "name": "Lekki Arts and Crafts Market",
    "exact_location": "Lekki Arts and Crafts Market, Lagos — artisan market frontage",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Malibu El Matador Cove",
    "exact_location": "El Matador State Beach, Malibu, California — sea arch cove",
    "preview": "/studio/assets/beach-01.jpg"
  },
  {
    "region": "Beach",
    "name": "Zanzibar Paje White Sands",
    "exact_location": "Paje Beach, Zanzibar — white sand and turquoise lagoon",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Santorini Oia Caldera",
    "exact_location": "Oia, Santorini, Greece — whitewashed caldera terraces",
    "preview": "/templates/bg/santorini-oia.jpg"
  },
  {
    "region": "Beach",
    "name": "Bora Bora Overwater Lagoon",
    "exact_location": "Matira Beach, Bora Bora — turquoise lagoon and palms",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Mykonos Nammos Shore",
    "exact_location": "Psarou Beach, Mykonos, Greece — luxury beach club shoreline",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Tulum Palm Beach",
    "exact_location": "Playa Paraíso, Tulum, Mexico — palm-lined Caribbean beach",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Seychelles Anse Lazio",
    "exact_location": "Anse Lazio, Praslin, Seychelles — granite cove",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Amalfi Positano Spiaggia",
    "exact_location": "Spiaggia Grande, Positano, Italy — colourful coastal village",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Cape Town Camps Bay",
    "exact_location": "Camps Bay Beach, Cape Town — Twelve Apostles backdrop",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  },
  {
    "region": "Beach",
    "name": "Phuket Freedom Beach",
    "exact_location": "Freedom Beach, Phuket, Thailand — tropical cove",
    "preview": "/studio/assets/editorial-studio-DHISP2vi.webp"
  }
] as const;
const TOOL_DEFINITIONS = [
  {
    "id": "background-studio",
    "name": "Background Studio",
    "kind": "Backdrop",
    "free": 3
  },
  {
    "id": "garment-to-model",
    "name": "Garment to Model",
    "kind": "Model campaign",
    "free": 5
  },
  {
    "id": "virtual-try-on",
    "name": "Virtual Try-On",
    "kind": "Try-on scene",
    "free": 5
  },
  {
    "id": "fashion-image-creator",
    "name": "Fashion Image Creator",
    "kind": "Editorial",
    "free": 5
  },
  {
    "id": "fashion-moodboard",
    "name": "Fashion Moodboard",
    "kind": "Moodboard",
    "free": 3
  },
  {
    "id": "video-creator",
    "name": "Video Creator",
    "kind": "Fashion video",
    "free": 2
  },
  {
    "id": "campaign-video",
    "name": "Campaign Video",
    "kind": "Campaign",
    "free": 3
  },
  {
    "id": "lookbook-creator",
    "name": "Lookbook Creator",
    "kind": "Lookbook",
    "free": 5
  },
  {
    "id": "pose-changer",
    "name": "Pose Changer",
    "kind": "Pose",
    "free": 5
  },
  {
    "id": "color-changer",
    "name": "Color Changer",
    "kind": "Color story",
    "free": 5
  },
  {
    "id": "pattern-mixer",
    "name": "Pattern Mixer",
    "kind": "Pattern",
    "free": 5
  },
  {
    "id": "size-adjuster",
    "name": "Size Adjuster",
    "kind": "Fit",
    "free": 5
  },
  {
    "id": "accessory-adder",
    "name": "Accessory Adder",
    "kind": "Accessory",
    "free": 5
  },
  {
    "id": "hair-styler",
    "name": "Hair Styler",
    "kind": "Hair editorial",
    "free": 5
  },
  {
    "id": "face-swap",
    "name": "Face Swap",
    "kind": "Portrait",
    "free": 5
  },
  {
    "id": "fabric-restyle",
    "name": "Fabric Restyle",
    "kind": "Fabric",
    "free": 5
  },
  {
    "id": "e-commerce-pack",
    "name": "E-commerce Pack",
    "kind": "Product",
    "free": 5
  },
  {
    "id": "collection-generator",
    "name": "Collection Generator",
    "kind": "Collection",
    "free": 5
  },
  {
    "id": "tech-pack",
    "name": "Tech Pack",
    "kind": "Technical",
    "free": 5
  },
  {
    "id": "editorial-enhancer",
    "name": "Editorial Enhancer",
    "kind": "Editorial finish",
    "free": 5
  }
] as const;

export const TEMPLATES_2000: LocationTemplate[] = TOOL_DEFINITIONS.flatMap((tool) =>
  LOCATION_PRESETS.map((place, index) => {
    const tier: TemplateTier = index < tool.free ? "free" : "pro";
    const kind = tool.kind;
    return {
      id: `${tool.id}-${String(index + 1).padStart(3, "0")}`,
      toolId: tool.id,
      toolName: tool.name,
      name: `${place.name} — ${kind}`,
      region: place.region,
      exact_location: place.exact_location,
      preview: place.preview,
      tier,
      locked: tier === "pro",
      prompt: `Create a photorealistic ${kind.toLowerCase()} using the exact location: ${place.exact_location}. Preserve the uploaded garment exactly: original colour, silhouette, neckline, straps, seams, print, fabric texture and construction. Do not redesign or recolour the garment. Keep the model and garment naturally integrated into the scene.`
    };
  })
);

export const TEMPLATES_BY_TOOL: Record<string, TemplateToolDefinition> =
  Object.fromEntries(TOOL_DEFINITIONS.map((tool) => {
    const templates = TEMPLATES_2000.filter((item) => item.toolId === tool.id);
    return [tool.id, { id: tool.id, name: tool.name, free: tool.free, pro: 100 - tool.free, templates }];
  }));

export function getTemplatesForTool(toolId: string, isPro: boolean): LocationTemplate[] {
  return (TEMPLATES_BY_TOOL[toolId]?.templates ?? []).map((item) => ({
    ...item,
    locked: item.tier === "pro" && !isPro
  }));
}

export function validateTemplateCatalog(): { total: number; tools: number; perTool: number; duplicatesWithinTool: string[]; free: number; pro: number } {
  const duplicatesWithinTool: string[] = [];
  for (const tool of TOOL_DEFINITIONS) {
    const seen = new Set<string>();
    for (const item of TEMPLATES_BY_TOOL[tool.id].templates) {
      if (seen.has(item.exact_location)) duplicatesWithinTool.push(tool.id + ": " + item.exact_location);
      seen.add(item.exact_location);
    }
  }
  return {
    total: TEMPLATES_2000.length,
    tools: TOOL_DEFINITIONS.length,
    perTool: TEMPLATES_2000.length / TOOL_DEFINITIONS.length,
    duplicatesWithinTool,
    free: TEMPLATES_2000.filter((item) => item.tier === "free").length,
    pro: TEMPLATES_2000.filter((item) => item.tier === "pro").length
  };
}
