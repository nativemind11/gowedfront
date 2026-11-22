# CULMERA service-image batch 01

Completed batch: 10 service visuals.

## Generated slugs

- `hr`
- `project-management`
- `accounting`
- `logistics`
- `pos`
- `property-mgmt`
- `support-desk`
- `documents-esign`
- `portals`
- `education-lms`

## Asset convention

Each slug has an original PNG and an optimized WebP derivative under `images/services/`:

- `images/services/{slug}.png`
- `images/services/{slug}.webp`

All assets are 2816×1584 (16:9). The frontend uses the WebP files for the catalog cards and service detail pages, with `loading="lazy"`, `decoding="async"`, `width="2816"`, and `height="1584"`. Existing SVG artwork remains the fallback for every other service.

## Validation completed

- `node --check js/app.js`
- `node --check js/catalog-art.js`
- 10 PNG files and 10 WebP files verified.
- All generated images verified at 2816×1584.
- Visual review completed for distinct functional compositions.

The next batch must not be generated until the task owner confirms.
