import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SupporterBadge from "@/components/supporter/SupporterBadge";
import SupporterKit from "@/components/supporter/SupporterKit";
import {
  CLUB_PALETTES,
  type ClubPaletteId
} from "@/lib/game/club-identity";
import {
  SUPPORTER_ARTWORK_COLORS,
  SUPPORTER_BADGE_SIZES,
  SUPPORTER_KIT_SIZES
} from "@/lib/game/supporter-designs";

const paletteIds = Object.keys(CLUB_PALETTES) as ClubPaletteId[];

function renderBadge(props: ComponentProps<typeof SupporterBadge>): string {
  return renderToStaticMarkup(createElement(SupporterBadge, props));
}

function renderKit(props: ComponentProps<typeof SupporterKit>): string {
  return renderToStaticMarkup(createElement(SupporterKit, props));
}

function rootTag(markup: string): string {
  return markup.slice(0, markup.indexOf(">") + 1);
}

function expectTwoToneMark(markup: string): void {
  expect(markup).toContain(
    `class="footyrush-glyph-footy" fill="${SUPPORTER_ARTWORK_COLORS.markFooty}"`
  );
  expect(markup).toContain(
    `class="footyrush-glyph-rush" fill="${SUPPORTER_ARTWORK_COLORS.markRush}"`
  );
}

describe("supporter artwork", () => {
  it.each(paletteIds)("renders the %s palette in both supporter assets", (paletteId) => {
    const palette = CLUB_PALETTES[paletteId];
    const badge = renderBadge({ paletteId, decorative: true });
    const kit = renderKit({ paletteId, decorative: true });

    for (const markup of [badge, kit]) {
      expect(rootTag(markup)).toContain(`data-supporter-palette="${paletteId}"`);
      expect(markup).toContain(`fill="${palette.primary}"`);
      expect(markup).toContain(`fill="${palette.secondary}"`);
    }
  });

  it("falls back to the FootyRush palette for an invalid runtime palette", () => {
    const invalidPalette = "runtime_injected_palette" as ClubPaletteId;
    const badge = renderBadge({ paletteId: invalidPalette, decorative: true });
    const kit = renderKit({ paletteId: invalidPalette, decorative: true });
    const fallback = CLUB_PALETTES.footyrush;

    for (const markup of [badge, kit]) {
      expect(rootTag(markup)).toContain('data-supporter-palette="footyrush"');
      expect(markup).toContain(`fill="${fallback.primary}"`);
      expect(markup).toContain(`fill="${fallback.secondary}"`);
    }
  });

  it("identifies the fixed Founders' Rush design and artwork kind", () => {
    const badgeTag = rootTag(renderBadge({ paletteId: "footyrush", decorative: true }));
    const kitTag = rootTag(renderKit({ paletteId: "footyrush", decorative: true }));

    expect(badgeTag).toContain('data-supporter-artwork="badge"');
    expect(badgeTag).toContain('data-supporter-design="founders_sash"');
    expect(kitTag).toContain('data-supporter-artwork="kit"');
    expect(kitTag).toContain('data-supporter-design="founders_sash"');
  });

  it("keeps the FootyRush glyph white and cyan in both assets", () => {
    expectTwoToneMark(renderBadge({ paletteId: "red_white", decorative: true }));
    expectTwoToneMark(renderKit({ paletteId: "black_amber", decorative: true }));
  });

  it("renders a player number in the kit's fixed contrast capsule", () => {
    const kit = renderKit({
      paletteId: "claret_sky",
      playerNumber: 10,
      decorative: true
    });

    expect(kit).toContain(`<text x="60"`);
    expect(kit).toContain(`fill="${SUPPORTER_ARTWORK_COLORS.navy}"`);
    expect(kit).toContain(">10</text>");
  });

  it("provides a labelled image by default", () => {
    const markup = renderBadge({
      paletteId: "footyrush",
      title: "Northbank Supporter Edition badge"
    });
    const tag = rootTag(markup);

    expect(tag).toContain('role="img"');
    expect(tag).toMatch(/aria-labelledby="supporter-badge-title-[^"]+"/);
    expect(markup).toMatch(
      /<title id="supporter-badge-title-[^"]+">Northbank Supporter Edition badge<\/title>/
    );
  });

  it("removes image semantics and title when explicitly decorative", () => {
    const markup = renderKit({
      paletteId: "footyrush",
      title: "This title must not be exposed",
      decorative: true
    });
    const tag = rootTag(markup);

    expect(tag).toContain('aria-hidden="true"');
    expect(tag).not.toContain('role="img"');
    expect(tag).not.toContain("aria-labelledby");
    expect(markup).not.toContain("<title");
    expect(markup).not.toContain("This title must not be exposed");
  });

  it("uses the specified micro and preview badge dimensions", () => {
    const micro = rootTag(renderBadge({ paletteId: "footyrush", size: "micro", decorative: true }));
    const preview = rootTag(renderBadge({ paletteId: "footyrush", size: "preview", decorative: true }));

    expect(micro).toContain(`width="${SUPPORTER_BADGE_SIZES.micro.width}"`);
    expect(micro).toContain(`height="${SUPPORTER_BADGE_SIZES.micro.height}"`);
    expect(micro).toContain('data-supporter-size="micro"');
    expect(preview).toContain(`width="${SUPPORTER_BADGE_SIZES.preview.width}"`);
    expect(preview).toContain(`height="${SUPPORTER_BADGE_SIZES.preview.height}"`);
    expect(preview).toContain('data-supporter-size="preview"');
  });

  it("uses the specified micro and preview kit dimensions", () => {
    const micro = rootTag(renderKit({ paletteId: "footyrush", size: "micro", decorative: true }));
    const preview = rootTag(renderKit({ paletteId: "footyrush", size: "preview", decorative: true }));

    expect(micro).toContain(`width="${SUPPORTER_KIT_SIZES.micro.width}"`);
    expect(micro).toContain(`height="${SUPPORTER_KIT_SIZES.micro.height}"`);
    expect(micro).toContain('data-supporter-size="micro"');
    expect(preview).toContain(`width="${SUPPORTER_KIT_SIZES.preview.width}"`);
    expect(preview).toContain(`height="${SUPPORTER_KIT_SIZES.preview.height}"`);
    expect(preview).toContain('data-supporter-size="preview"');
  });
});
