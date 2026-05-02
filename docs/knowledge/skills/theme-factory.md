---
name: theme-factory
description: Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been created, or can generate a new theme on-the-fly.
license: Complete terms in LICENSE.txt
category: skills
updated: 2026-03-18
---

# Theme Factory Skill

This skill provides a curated collection of professional font and color themes, each with carefully selected color palettes and font pairings. Once a theme is chosen, it can be applied to any artifact.

## Purpose

To apply consistent, professional styling to presentation slide decks, documents, reports, or HTML landing pages. Each theme includes:

- A cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- A distinct visual identity suitable for different contexts and audiences

## Usage Instructions

To apply styling to a slide deck or other artifact:

1. **Show the theme showcase**: Display the `theme-showcase.pdf` file to allow users to see all available themes visually. Do not make any modifications to it; simply show the file for viewing.
2. **Ask for their choice**: Ask which theme to apply to the deck or artifact.
3. **Wait for selection**: Get explicit confirmation about the chosen theme.
4. **Apply the theme**: Once a theme has been chosen, apply the selected theme's colors and fonts to the deck/artifact.

## Themes Available

The following 10 themes are available, each showcased in `theme-showcase.pdf`:

1. **Ocean Depths** - Professional and calming maritime theme
2. **Sunset Boulevard** - Warm and vibrant sunset colors
3. **Forest Canopy** - Natural and grounded earth tones
4. **Modern Minimalist** - Clean and contemporary grayscale
5. **Golden Hour** - Rich and warm autumnal palette
6. **Arctic Frost** - Cool and crisp winter-inspired theme
7. **Desert Rose** - Soft and sophisticated dusty tones
8. **Tech Innovation** - Bold and modern tech aesthetic
9. **Botanical Garden** - Fresh and organic garden colors
10. **Midnight Galaxy** - Dramatic and cosmic deep tones

## Theme Details

Each theme is defined in the `themes/` directory with complete specifications including:

- Cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- Distinct visual identity suitable for different contexts and audiences

## Application Process

After a preferred theme is selected:

1. Read the corresponding theme file from the `themes/` directory
2. Apply the specified colors and fonts consistently throughout the deck or artifact
3. Ensure proper contrast and readability
4. Maintain the theme's visual identity across all slides or sections

## Create Your Own Theme

To handle cases where none of the existing themes work for an artifact, create a custom theme:

1. Based on provided inputs (mood, audience, brand hints, or a short description), generate a new theme similar to the preset ones.
2. Give the theme a descriptive name that reflects the font/color combination (e.g. "Ocean Depths", "Desert Rose").
3. Specify a cohesive color palette (hex codes) and complementary font pairings for headers and body text.
4. Show the theme spec for review and verification before applying.
5. After approval, apply the theme to the artifact as described in Application Process above.

Use CSS variables or a small style block when applying to HTML; use the theme's colors and fonts in slide decks or docs per the format (e.g. slide master, doc styles).
