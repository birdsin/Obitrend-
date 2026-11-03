/** OBITREND 2,120-template location catalog.
 * 20 tools × 106 templates. Locations are unique within each tool.
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
    "name": "Times Square Neon Night August 2025",
    "exact_location": "Times Square, New York — Broadway at night with illuminated fashion billboards; photographed 31 August 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Times_Square%2C_NYC_at_night_-_August_2025.jpg/960px-Times_Square%2C_NYC_at_night_-_August_2025.jpg"
  },
  {
    "region": "USA",
    "name": "SoHo Manhattan November 2025",
    "exact_location": "SoHo, Manhattan — contemporary cast-iron district street scene photographed 25 November 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/SoHo_Manhattan_November_2025_250.jpg/960px-SoHo_Manhattan_November_2025_250.jpg"
  },
  {
    "region": "USA",
    "name": "DUMBO Brooklyn Waterfront June 2025",
    "exact_location": "DUMBO waterfront, Brooklyn, New York — photographed 18 June 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Dumbo_Brooklyn_June_2025_071.jpg/960px-Dumbo_Brooklyn_June_2025_071.jpg"
  },
  {
    "region": "USA",
    "name": "Empire State Building Observation Deck October 2025",
    "exact_location": "View north from the Empire State Building observation deck, Manhattan — photographed 22 October 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/NYC_Skyline_view_toward_uptown_from_Empire_State_Building%2C_around_1_pm.jpg/960px-NYC_Skyline_view_toward_uptown_from_Empire_State_Building%2C_around_1_pm.jpg"
  },
  {
    "region": "USA",
    "name": "Williamsburg Waterfront",
    "exact_location": "Domino Park, Williamsburg — East River skyline promenade",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/View_from_Domino_Park_013.jpg/960px-View_from_Domino_Park_013.jpg"
  },
  {
    "region": "USA",
    "name": "Chelsea High Line",
    "exact_location": "The High Line, Chelsea — elevated garden walkway",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/High_Line_at_Chelsea_Market_from_street_level%2C_September_2025.jpg/960px-High_Line_at_Chelsea_Market_from_street_level%2C_September_2025.jpg"
  },
  {
    "region": "China",
    "name": "Tianjin Modern Skyline 2025",
    "exact_location": "Tianjin, China — modern city skyline viewed from the urban district",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/%E5%A4%A9%E6%B4%A5%E5%A4%A9%E9%99%85%E7%BA%BF202511.jpg/960px-%E5%A4%A9%E6%B4%A5%E5%A4%A9%E9%99%85%E7%BA%BF202511.jpg"
  },
  {
    "region": "USA",
    "name": "Central Park Bethesda Terrace",
    "exact_location": "Bethesda Terrace, Central Park — arcade and fountain",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Bethesda_Terrace,_Central_Park,_New_York.jpg/960px-Bethesda_Terrace,_Central_Park,_New_York.jpg"
  },
  {
    "region": "USA",
    "name": "Tribeca Cobblestone Lane",
    "exact_location": "Tribeca, Manhattan — cobblestone street and converted lofts",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Tribeca_Manhattan_September_2025_143.jpg/960px-Tribeca_Manhattan_September_2025_143.jpg"
  },
  {
    "region": "USA",
    "name": "Fifth Avenue Luxury Row",
    "exact_location": "Fifth Avenue, Manhattan — flagship luxury storefronts",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Fifth_Ave_New_York_Color_Street_Photography_%28238250157%29.jpeg/960px-Fifth_Ave_New_York_Color_Street_Photography_%28238250157%29.jpeg"
  },
  {
    "region": "USA",
    "name": "Flatiron District Broadway",
    "exact_location": "Flatiron District — Broadway and the Flatiron Building",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Flatiron_District_Jun_2026_24.jpg/960px-Flatiron_District_Jun_2026_24.jpg"
  },
  {
    "region": "USA",
    "name": "Hudson Yards Vessel Plaza",
    "exact_location": "Hudson Yards, Manhattan — public plaza and modern towers",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/At_New_York_City_2025_001_-_Hudson_Yards_skyline%2C_New_York%2C_at_night.jpg/960px-At_New_York_City_2025_001_-_Hudson_Yards_skyline%2C_New_York%2C_at_night.jpg"
  },
  {
    "region": "UK",
    "name": "Westminster Bridge Big Ben May 2026",
    "exact_location": "Westminster Bridge, London — Palace of Westminster and Elizabeth Tower, photographed 8 May 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Palace_of_Westminster_and_Big_Ben_viewed_from_Westminster_Bridge.jpg/960px-Palace_of_Westminster_and_Big_Ben_viewed_from_Westminster_Bridge.jpg"
  },
  {
    "region": "UK",
    "name": "Sclater Street Brick Lane Market March 2026",
    "exact_location": "Sclater Street, Brick Lane Market, Shoreditch, London — graffiti-lined market street photographed 15 March 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Bicycle_Sclater_Street_Brick_Lane_Market_Shoreditch_London_England_01.jpg/960px-Bicycle_Sclater_Street_Brick_Lane_Market_Shoreditch_London_England_01.jpg"
  },
  {
    "region": "UK",
    "name": "Notting Hill Pastel Row",
    "exact_location": "Portobello Road, Notting Hill, London — pastel terraced houses",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/5/51/Notting_hill_colorful_houses.jpg"
  },
  {
    "region": "UK",
    "name": "Covent Garden Piazza",
    "exact_location": "Covent Garden, London — historic market piazza",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Covent_Garden_London.jpg/960px-Covent_Garden_London.jpg"
  },
  {
    "region": "UK",
    "name": "Mayfair Bond Street",
    "exact_location": "New Bond Street, Mayfair, London — luxury boutiques",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Old_Bond_Street,_Mayfair_-_geograph.org.uk_-_4944256.jpg/960px-Old_Bond_Street,_Mayfair_-_geograph.org.uk_-_4944256.jpg"
  },
  {
    "region": "UK",
    "name": "Carnaby Street London August 2025",
    "exact_location": "Carnaby Street, Soho, London — photographed 27 August 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Carnaby_Street_2025-08-27.jpg/960px-Carnaby_Street_2025-08-27.jpg"
  },
  {
    "region": "UK",
    "name": "Camden Lock Market",
    "exact_location": "Camden Lock, London — canal-side market",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Camden.lock.market.london.arp.jpg/960px-Camden.lock.market.london.arp.jpg"
  },
  {
    "region": "UK",
    "name": "Southbank Thames Walk",
    "exact_location": "South Bank, London — riverside promenade",
    "preview": "https://s0.geograph.org.uk/geophotos/08/30/24/8302420_6d9a742f.jpg"
  },
  {
    "region": "UK",
    "name": "Tower Bridge London June 2026",
    "exact_location": "Tower Bridge, London — photographed 26 June 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Tower_Bridge_spanning_the_River_Thames_in_London_under_a_clear_blue_sky.jpg/960px-Tower_Bridge_spanning_the_River_Thames_in_London_under_a_clear_blue_sky.jpg"
  },
  {
    "region": "UK",
    "name": "St Paul's Millennium Bridge Twilight 2025",
    "exact_location": "Millennium Bridge and St Paul's Cathedral, London — photographed 16 July 2025 at twilight",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/St_Paul%27s_and_Millennium_Bridge_2025-07-16.jpg/960px-St_Paul%27s_and_Millennium_Bridge_2025-07-16.jpg"
  },
  {
    "region": "UK",
    "name": "Kensington Palace Gardens",
    "exact_location": "Kensington Gardens, London — palace approach",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Kensington_Palace%2C_The_Sunken_Garden_2025.jpg/960px-Kensington_Palace%2C_The_Sunken_Garden_2025.jpg"
  },
  {
    "region": "UK",
    "name": "Regent Street 2025",
    "exact_location": "Regent Street, West End, London — Sunday morning shopping avenue photographed 10 August 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Regent_Street_2025-08-10.jpg/960px-Regent_Street_2025-08-10.jpg"
  },
  {
    "region": "UK",
    "name": "Gasholder Park King's Cross 2025",
    "exact_location": "Gasholder Park, King's Cross, London — park photographed 15 March 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Gasholder_park.jpg/960px-Gasholder_park.jpg"
  },
  {
    "region": "UK",
    "name": "Leadenhall Market",
    "exact_location": "Leadenhall Market, City of London — Victorian covered arcade",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Leadenhall_Market_entrance_on_Whittington_Avenue_in_London.jpg/960px-Leadenhall_Market_entrance_on_Whittington_Avenue_in_London.jpg"
  },
  {
    "region": "UK",
    "name": "Borough Market Passage",
    "exact_location": "Borough Market, Southwark, London — market lanes",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Borough_Market_2025-06-10.jpg/960px-Borough_Market_2025-06-10.jpg"
  },
  {
    "region": "Paris",
    "name": "Eiffel Tower Paris July 2025",
    "exact_location": "Champ de Mars, Eiffel Tower, Paris — recent landmark view photographed 28 July 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Eiffel_Tower_4_July_28%2C_2025.jpg/960px-Eiffel_Tower_4_July_28%2C_2025.jpg"
  },
  {
    "region": "Paris",
    "name": "Montmartre Sacré-Cœur Steps July 2026",
    "exact_location": "Steps and forecourt of Basilique du Sacré-Cœur, Montmartre, Paris — photographed 25 July 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/People_outside_Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre_Paris_Aug_2026.jpg/960px-People_outside_Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre_Paris_Aug_2026.jpg"
  },
  {
    "region": "Paris",
    "name": "Le Marais Rue de Turenne",
    "exact_location": "Rue de Turenne, Le Marais, Paris — elegant historic façades",
    "preview": "https://commons.wikimedia.org/wiki/Special:FilePath/34_rue_de_Turenne,_Paris,_France_Jan_09,_2025_04-24-18_PM.jpg?width=960"
  },
  {
    "region": "Paris",
    "name": "Boulevard Saint-Germain Paris July 2025",
    "exact_location": "Boulevard Saint-Germain and Quai de la Tournelle, Paris — photographed 13 July 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Boulevard_Saint-Germain_et_Quai_de_la_Tournelle_%28juillet_2025%29.JPG/960px-Boulevard_Saint-Germain_et_Quai_de_la_Tournelle_%28juillet_2025%29.JPG"
  },
  {
    "region": "Paris",
    "name": "Champs-Élysées Paris July 2025",
    "exact_location": "Avenue des Champs-Élysées, Paris — photographed 14 July 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Avenue_Champs_%C3%89lys%C3%A9es_-_Paris_VIII_%28FR75%29_-_2025-07-14_-_1.jpg/960px-Avenue_Champs_%C3%89lys%C3%A9es_-_Paris_VIII_%28FR75%29_-_2025-07-14_-_1.jpg"
  },
  {
    "region": "Paris",
    "name": "Canal Saint-Martin Paris June 2025",
    "exact_location": "Canal Saint-Martin, 10th arrondissement, Paris — photographed 21 June 2025",
    "preview": "https://commons.wikimedia.org/wiki/Special:FilePath/Canal_Saint-Martin.jpg?width=960"
  },
  {
    "region": "Paris",
    "name": "Louvre Pyramid Paris 2026",
    "exact_location": "Cour Napoléon, Louvre, Paris — glass pyramid photographed 24 July 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Louvre_Pyramid_and_Cour_Napol%C3%A9on%2C_Paris.jpg/960px-Louvre_Pyramid_and_Cour_Napol%C3%A9on%2C_Paris.jpg"
  },
  {
    "region": "Paris",
    "name": "Pont Alexandre III",
    "exact_location": "Pont Alexandre III, Paris — ornate Seine bridge",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Paris_-_pont_Alexandre-III_-_2026-09-16_13-08-36_015.jpg/960px-Paris_-_pont_Alexandre-III_-_2026-09-16_13-08-36_015.jpg"
  },
  {
    "region": "Milan",
    "name": "Galleria Vittorio Emanuele II — 2026 Evening",
    "exact_location": "Galleria Vittorio Emanuele II, Milan — evening exterior arcade architecture photographed in May 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Galleria_Vittorio_Emanuele_II_Milan.jpg/960px-Galleria_Vittorio_Emanuele_II_Milan.jpg"
  },
  {
    "region": "Milan",
    "name": "Duomo Square Milan 2026",
    "exact_location": "Piazza del Duomo, Milan — cathedral facade photographed 2 July 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Il_Duomo_di_Milano_-_July_2026.jpg/960px-Il_Duomo_di_Milano_-_July_2026.jpg"
  },
  {
    "region": "Milan",
    "name": "Naviglio Grande Milan March 2026",
    "exact_location": "Naviglio Grande, Milan — canal-side buildings and pedestrian bridge photographed 16 March 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Naviglio_Grande_canal_Milan_2026.JPG/960px-Naviglio_Grande_canal_Milan_2026.JPG"
  },
  {
    "region": "Milan",
    "name": "Brera Courtyard Milan October 2025",
    "exact_location": "Palazzo di Brera, Milan — courtyard photographed 29 October 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/La_Brera%2C_Milan%2C_courtyard.jpg/960px-La_Brera%2C_Milan%2C_courtyard.jpg"
  },
  {
    "region": "Milan",
    "name": "Quadrilatero della Moda",
    "exact_location": "Via Montenapoleone, Milan — luxury fashion district street scene photographed December 2005",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Montenapoleone.jpg/960px-Montenapoleone.jpg"
  },
  {
    "region": "Milan",
    "name": "Arco della Pace Milan March 2026",
    "exact_location": "Piazza Sempione, Milan — Arch of Peace photographed 15 March 2026",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Arco_della_Pace_Piazza_Sempione_Milan_2026.JPG/960px-Arco_della_Pace_Piazza_Sempione_Milan_2026.JPG"
  },
  {
    "region": "Milan",
    "name": "Castello Sforzesco Courtyard 2026",
    "exact_location": "Castello Sforzesco, Milan — courtyard photographed 3 January 2026",
    "preview": "https://images.pexels.com/photos/35591299/pexels-photo-35591299.jpeg?cs=srgb&dl=pexels-valeria-drozdova-2148646707-35591299.jpg&fm=jpg"
  },
  {
    "region": "Milan",
    "name": "Fondazione Prada Milan August 2025",
    "exact_location": "Fondazione Prada, Milan — contemporary architecture photographed 20 August 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Fondazione_Prada%2C_Milan.jpg/960px-Fondazione_Prada%2C_Milan.jpg"
  },
  {
    "region": "Lagos",
    "name": "Lekki-Ikoyi Link Bridge Aerial April 2025",
    "exact_location": "Lekki-Ikoyi Link Bridge, Lagos — aerial view of the bridge over the lagoon, photographed 17 April 2025",
    "preview": "https://images.unsplash.com/photo-1744907895363-d351aa6019ef?auto=format&fit=crop&fm=jpg&ixid=NHwxMjA3fDA%3D&ixlib=rb-4.1.0&q=60&w=3000"
  },
  {
    "region": "Lagos",
    "name": "Victoria Island Skyline June 2025",
    "exact_location": "Victoria Island, Lagos, Nigeria — cityscape photographed 4 June 2025",
    "preview": "https://images.unsplash.com/photo-1749058387715-1efad0eadc8c?auto=format&fit=crop&fm=jpg&ixid=NHwxMjA3fDA%3D&ixlib=rb-4.1.0&q=60&w=3000"
  },
  {
    "region": "Lagos",
    "name": "Balogun Market Fashion Lane",
    "exact_location": "Balogun Market, Lagos Island — textile and fashion trading lanes",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Balogun_Market%2C_Lagos_Island.jpg/960px-Balogun_Market%2C_Lagos_Island.jpg"
  },
  {
    "region": "Lagos",
    "name": "Banana Island Lagoon City",
    "exact_location": "Banana Island, Ikoyi, Lagos — historic Lagoon City / World Trade Centre view, photographed 19 September 1981",
    "preview": "https://commons.wikimedia.org/wiki/Special:FilePath/Lagoon_City_World_Trade_Centre.jpg?width=960"
  },
  {
    "region": "Lagos",
    "name": "Yaba Market Sunset",
    "exact_location": "Yaba Market, Lagos — market activity at sunset, photographed 25 October 2017",
    "preview": "https://commons.wikimedia.org/wiki/Special:FilePath/Sunset_at_Yaba_Market,_Lagos.jpg?width=960"
  },
  {
    "region": "Lagos",
    "name": "Eko Atlantic Oceanfront",
    "exact_location": "Eko Atlantic City, Lagos — sea defence and Atlantic oceanfront",
    "preview": "https://www.ekoatlantic.com/images/wp/aerial1.webp"
  },
  {
    "region": "Lagos",
    "name": "National Theatre Waterfront",
    "exact_location": "National Theatre, Iganmu, Lagos — cultural landmark approach",
    "preview": "https://images.pexels.com/photos/40388370/pexels-photo-40388370.jpeg?cs=srgb&dl=pexels-sh1zik-prod-2161463258-40388370.jpg&fm=jpg"
  },
  {
    "region": "Lagos",
    "name": "Tarkwa Bay Beachfront",
    "exact_location": "Tarkwa Bay, Lagos — sandy beach and coastal water",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Tarkwa_bay_beach%2C_Lagos%2C_Nigeria.jpg/960px-Tarkwa_bay_beach%2C_Lagos%2C_Nigeria.jpg"
  },
  {
    "region": "Lagos",
    "name": "Lekki Phase One Boulevard",
    "exact_location": "Lekki Phase 1, Lagos — contemporary retail boulevard",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Lekki_Phase_One%2C_Lagos_Nigeria.jpg/1280px-Lekki_Phase_One%2C_Lagos_Nigeria.jpg"
  },
  {
    "region": "Lagos",
    "name": "Oniru Beach Promenade",
    "exact_location": "Oniru Beach, Victoria Island, Lagos — beachfront promenade",
    "preview": "https://commons.wikimedia.org/wiki/Special:FilePath/A_view_of_the_Atlantic_Ocean_from_Oniru_beach_in_Lagos,_Nigeria.jpg?width=960"
  },
  {
    "region": "Lagos",
    "name": "Freedom Park Lagos",
    "exact_location": "Freedom Park, Lagos Island — historic garden pond and statue",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Lagos-Freedom-Park-Pond-Aug-2026-IMG_6724.jpg/960px-Lagos-Freedom-Park-Pond-Aug-2026-IMG_6724.jpg"
  },
  {
    "region": "Lagos",
    "name": "Nike Art Gallery Exterior",
    "exact_location": "Nike Art Gallery, Lekki, Lagos — contemporary art gallery exterior",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Lagos_Lekki_Nike_Art_Gallery_Aug_2026_IMG_6951b.jpg/960px-Lagos_Lekki_Nike_Art_Gallery_Aug_2026_IMG_6951b.jpg"
  },
  {
    "region": "Lagos",
    "name": "Eko Atlantic City Entrance",
    "exact_location": "Eko Atlantic City entrance, Victoria Island, Lagos — photographed 10 July 2019",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Eko_Atlantic_City_Entrance%2C_Lagos.jpeg/1024px-Eko_Atlantic_City_Entrance%2C_Lagos.jpeg"
  },
  {
    "region": "Lagos",
    "name": "Landmark Beach Coastline",
    "exact_location": "Landmark Beach, Victoria Island, Lagos — coastal leisure scene",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Sunset_at_Landmark_Beach.jpg/1024px-Sunset_at_Landmark_Beach.jpg"
  },
  {
    "region": "Lagos",
    "name": "Jubilee Bridge Ikoyi",
    "exact_location": "Lekki-Ikoyi Link Bridge, Lagos — cable-stayed bridge over the lagoon",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Lagos-Nigeria-Ikoyi-Link-bridge-boats-in-lagoon-IMG_7632.jpg/960px-Lagos-Nigeria-Ikoyi-Link-bridge-boats-in-lagoon-IMG_7632.jpg"
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
    "exact_location": "Paje Beach, Zanzibar — white-sand shoreline and Indian Ocean beach life",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Cows_on_a_beach_in_Zanzibar.jpg/960px-Cows_on_a_beach_in_Zanzibar.jpg"
  },
  {
    "region": "Beach",
    "name": "Santorini Oia Blue-Domed Churches October 2025",
    "exact_location": "Oia, Santorini, Greece — blue-domed churches above the caldera, photographed 13 October 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/1000_Three_domes_of_Oia_in_Santorini_Photo_by_Giles_Laurent.jpg/960px-1000_Three_domes_of_Oia_in_Santorini_Photo_by_Giles_Laurent.jpg"
  },
  {
    "region": "Beach",
    "name": "Bora Bora Overwater Lagoon",
    "exact_location": "Matira Beach, Bora Bora — turquoise lagoon and palms",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Matira_Beach%2C_Bora_Bora%2C_French_Polynesia.jpg/960px-Matira_Beach%2C_Bora_Bora%2C_French_Polynesia.jpg"
  },
  {
    "region": "Beach",
    "name": "Mykonos Nammos Shore",
    "exact_location": "Psarou Beach, Mykonos, Greece — luxury beach club shoreline",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Psarou_mykonos.JPG/960px-Psarou_mykonos.JPG"
  },
  {
    "region": "Beach",
    "name": "Tulum Palm Beach",
    "exact_location": "Tulum-Tancah beach, Tulum, Mexico — turquoise Caribbean water, rocky shoreline and palms",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Beach_at_Tulum_Mexico.jpg/1280px-Beach_at_Tulum_Mexico.jpg"
  },
  {
    "region": "Beach",
    "name": "Seychelles Anse Lazio",
    "exact_location": "Anse Lazio Beach, Praslin, Seychelles — aerial coastal view photographed 27 October 2017",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Anse_Lazio_Beach%2C_Seychelles_%2838720921075%29.jpg/1280px-Anse_Lazio_Beach%2C_Seychelles_%2838720921075%29.jpg"
  },
  {
    "region": "Beach",
    "name": "Amalfi Positano Spiaggia",
    "exact_location": "Positano, Amalfi Coast, Italy — Spiaggia Grande and colourful cliffside village",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Positano_sea.jpg/960px-Positano_sea.jpg"
  },
  {
    "region": "Beach",
    "name": "Cape Town Camps Bay",
    "exact_location": "Camps Bay Beach, Cape Town — Atlantic shoreline and sandy beach",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Camps_bay_beach.jpg/960px-Camps_bay_beach.jpg"
  },
  {
    "region": "Beach",
    "name": "Phuket Freedom Beach",
    "exact_location": "Freedom Beach, Phuket, Thailand — tropical cove",
    "preview": "https://images.unsplash.com/photo-1769679628450-1eedef9d3b30?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000"
  },
  {
    "region": "Luxury Villa",
    "name": "Mykonos Cliff Infinity Pool",
    "exact_location": "Mykonos, Greece — cliffside villa infinity pool",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Bali Ubud Jungle Retreat",
    "exact_location": "Ubud, Bali — jungle-view luxury villa",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "TH8 Palm Dubai Beach Resort January 2025",
    "exact_location": "Palm Jumeirah, Dubai — resort balcony view across the beach and waterfront skyline, photographed 28 January 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Th8_Palm_Dubai_Beach_Resort.jpg/960px-Th8_Palm_Dubai_Beach_Resort.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Amalfi Terrace Villa",
    "exact_location": "Amalfi Coast, Italy — sea-view stone terrace",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Santorini Oia Twilight Panorama October 2025",
    "exact_location": "Oia, Santorini, Greece — panoramic village and caldera at twilight, photographed 11 October 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/1002_Panoramic_view_of_Oia_at_night_in_Santorini_Photo_by_Giles_Laurent.jpg/960px-1002_Panoramic_view_of_Oia_at_night_in_Santorini_Photo_by_Giles_Laurent.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Maldives Overwater Residence",
    "exact_location": "North Malé Atoll, Maldives — overwater villa deck",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Marrakech Riad Courtyard",
    "exact_location": "Medina, Marrakech — luxury riad courtyard",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Tuscany Vineyard Estate",
    "exact_location": "Chianti, Tuscany — vineyard villa terrace",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Cape Town Atlantic Villa",
    "exact_location": "Camps Bay, Cape Town — modern ocean-view villa",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Luxury Villa",
    "name": "Lake Como Grand Villa",
    "exact_location": "Lake Como, Italy — lakeside historic villa",
    "preview": "/studio/assets/luxury-villa-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Swiss Alps Zermatt View",
    "exact_location": "Zermatt, Switzerland — Matterhorn-facing alpine terrace",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Dolomites Seceda Ridge",
    "exact_location": "Seceda, South Tyrol, Italy — dramatic mountain ridge",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Banff Lake Louise",
    "exact_location": "Lake Louise, Alberta, Canada — turquoise alpine lake",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Aspen Maroon Bells",
    "exact_location": "Maroon Bells, Aspen, Colorado — mountain reflection",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Himalaya Namche View",
    "exact_location": "Namche Bazaar, Nepal — Himalayan mountain panorama",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Table Mountain Summit",
    "exact_location": "Table Mountain, Cape Town — city and ocean panorama",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Mount Fuji Lake Kawaguchi",
    "exact_location": "Lake Kawaguchi, Japan — Mount Fuji reflection",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Mountains",
    "name": "Scottish Highlands Glencoe",
    "exact_location": "Glencoe, Scotland — dramatic highland valley",
    "preview": "/studio/assets/mountains-01.jpg"
  },
  {
    "region": "Desert",
    "name": "Dubai Red Dune Sunset",
    "exact_location": "Al Lahbab Desert, Dubai — red dunes at sunset",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Desert",
    "name": "Sahara Merzouga Dunes",
    "exact_location": "Erg Chebbi, Merzouga, Morocco — golden dunes",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Desert",
    "name": "Wadi Rum Sandstone Valley",
    "exact_location": "Wadi Rum, Jordan — sandstone desert valley",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Desert",
    "name": "Namib Sossusvlei Dunes",
    "exact_location": "Sossusvlei, Namibia — red dunes and white pan",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Desert",
    "name": "Atacama Moon Valley",
    "exact_location": "Valle de la Luna, Atacama, Chile — lunar desert landscape",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Desert",
    "name": "Arizona Monument Valley",
    "exact_location": "Monument Valley, Arizona — sandstone buttes",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Desert",
    "name": "White Sands Dune Field",
    "exact_location": "White Sands National Park, New Mexico — white gypsum dunes",
    "preview": "/studio/assets/desert-01.jpg"
  },
  {
    "region": "Runway",
    "name": "Paris Haute Couture Runway",
    "exact_location": "Grand Palais, Paris — fashion runway interior",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "Runway",
    "name": "Milan Fashion Week Catwalk",
    "exact_location": "Milan Fashion Week venue, Milan — editorial catwalk",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "Runway",
    "name": "New York Fashion Week Stage",
    "exact_location": "Spring Studios, New York — fashion show runway",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "Runway",
    "name": "London Fashion Week Hall",
    "exact_location": "180 Strand, London — fashion runway venue",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "Runway",
    "name": "Lagos Fashion Week Runway",
    "exact_location": "Federal Palace Hotel, Victoria Island, Lagos — fashion runway",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "Runway",
    "name": "Copenhagen Minimal Runway",
    "exact_location": "Copenhagen Fashion Week venue, Copenhagen — minimalist runway",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "Runway",
    "name": "Dubai Luxury Runway",
    "exact_location": "Dubai Design District, Dubai — luxury fashion runway",
    "preview": "/studio/assets/runway-01.jpg"
  },
  {
    "region": "China",
    "name": "Shanghai Skyline 2025",
    "exact_location": "The Bund, Shanghai — Lujiazui skyline across the Huangpu River, photographed July 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Shanghai_Skyline_2025.jpg/960px-Shanghai_Skyline_2025.jpg"
  },
  {
    "region": "Canada",
    "name": "Toronto Skyline 2025",
    "exact_location": "Toronto, Ontario — skyline viewed from Ward's Island, photographed August 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Toronto_skyline.png/960px-Toronto_skyline.png"
  },
  {
    "region": "Japan",
    "name": "Osaka Expo 2025 Plaza",
    "exact_location": "Expo 2025 Osaka-Kansai — Hikari no Hiroba plaza, photographed April 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Expo2025_plaza.jpg/960px-Expo2025_plaza.jpg"
  },
  {
    "region": "Spain",
    "name": "Barcelona View 2025",
    "exact_location": "Barcelona, Spain — contemporary city view, photographed July 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Barcelona_view_in_2025.jpg/960px-Barcelona_view_in_2025.jpg"
  },
  {
    "region": "Germany",
    "name": "Berlin Television Tower Night 2025",
    "exact_location": "Alexanderplatz, Berlin — Fernsehturm at night, photographed December 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Berliner_Fernsehturm_Berlin-Mitte_at_night_2025-12-12_03.jpg/960px-Berliner_Fernsehturm_Berlin-Mitte_at_night_2025-12-12_03.jpg"
  },
  {
    "region": "Turkey",
    "name": "Istanbul City View 2025",
    "exact_location": "Istanbul, Türkiye — modern city view, photographed August 2025",
    "preview": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Istanbul_2025.jpg/960px-Istanbul_2025.jpg"
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
    "free": 3
  },
  {
    "id": "virtual-try-on",
    "name": "Virtual Try-On",
    "kind": "Try-on scene",
    "free": 3
  },
  {
    "id": "fashion-image-creator",
    "name": "Fashion Image Creator",
    "kind": "Editorial",
    "free": 3
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
    "free": 3
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
    "free": 3
  },
  {
    "id": "pose-changer",
    "name": "Pose Changer",
    "kind": "Pose",
    "free": 3
  },
  {
    "id": "color-changer",
    "name": "Color Changer",
    "kind": "Color story",
    "free": 3
  },
  {
    "id": "pattern-mixer",
    "name": "Pattern Mixer",
    "kind": "Pattern",
    "free": 3
  },
  {
    "id": "size-adjuster",
    "name": "Size Adjuster",
    "kind": "Fit",
    "free": 3
  },
  {
    "id": "accessory-adder",
    "name": "Accessory Adder",
    "kind": "Accessory",
    "free": 3
  },
  {
    "id": "hair-styler",
    "name": "Hair Styler",
    "kind": "Hair editorial",
    "free": 3
  },
  {
    "id": "face-swap",
    "name": "Face Swap",
    "kind": "Portrait",
    "free": 3
  },
  {
    "id": "fabric-restyle",
    "name": "Fabric Restyle",
    "kind": "Fabric",
    "free": 3
  },
  {
    "id": "e-commerce-pack",
    "name": "E-commerce Pack",
    "kind": "Product",
    "free": 3
  },
  {
    "id": "collection-generator",
    "name": "Collection Generator",
    "kind": "Collection",
    "free": 3
  },
  {
    "id": "tech-pack",
    "name": "Tech Pack",
    "kind": "Technical",
    "free": 3
  },
  {
    "id": "editorial-enhancer",
    "name": "Editorial Enhancer",
    "kind": "Editorial finish",
    "free": 3
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
    return [tool.id, { id: tool.id, name: tool.name, free: tool.free, pro: templates.length - tool.free, templates }];
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
