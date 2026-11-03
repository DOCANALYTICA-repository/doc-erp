import React from 'react';

import { ABOUT, SITE } from '../content';
// `@` is the repo-root alias from tsconfig.json / vite.config.ts. These two
// assets live at Workspace-Hub/assets/, i.e. outside src/, so a relative path
// from a section directory climbs four levels and says nothing about where it
// lands.
import docDeptImg from '@/assets/images/doc_department.jpg';
import docDeptImgWebp from '@/assets/images/doc_department.webp';

/**
 * Vision and mission, plus the department photograph.
 *
 * The two statements are tonally distinct on purpose: vision on sand, mission
 * on sage. They are the only two paragraphs on the page with no API behind
 * them, and treating them as one undifferentiated pair of grey cards was what
 * made them read as boilerplate.
 *
 * The `<picture>` element is preserved exactly — WebP with a JPEG fallback,
 * explicit dimensions so the box is reserved before the image lands, and lazy
 * loading. That was 829 kB of JPEG once.
 */
export const AboutSection: React.FC = () => (
  <section id="about" className="scroll-mt-20 px-5 pb-20 pt-6 sm:px-8 lg:px-14">
    <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-11">
      <div className="min-w-0 flex-1 basis-[380px]">
        <h2 className="mb-6 font-heading text-3xl font-semibold tracking-tight text-primary md:text-[38px]">
          {ABOUT.heading}
        </h2>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-muted px-6 py-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-accent">
              {ABOUT.vision.heading}
            </div>
            <p className="text-[15px] leading-[1.65] text-primary">{ABOUT.vision.body}</p>
          </div>

          <div className="rounded-lg bg-sage-200 px-6 py-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-sage-900">
              {ABOUT.mission.heading}
            </div>
            <p className="text-[15px] leading-[1.65] text-sage-900">{ABOUT.mission.body}</p>
          </div>
        </div>
      </div>

      <figure className="m-0 min-w-0 flex-1 basis-[380px]">
        <picture>
          <source srcSet={docDeptImgWebp} type="image/webp" />
          <img
            src={docDeptImg}
            width={1264}
            height={848}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-lg shadow-md"
            alt={SITE.imageAlt}
          />
        </picture>
        <figcaption className="mt-2.5 text-[11px] text-secondary">{SITE.imageCaption}</figcaption>
      </figure>
    </div>
  </section>
);
