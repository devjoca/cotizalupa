import { useEffect, useRef, useState } from "react";

import { HERO_EXAMPLES } from "./content";

const ROTATE_MS = 6000;
const FADE_MS = 450;

function wrap(n: number) {
  return (n + HERO_EXAMPLES.length) % HERO_EXAMPLES.length;
}

export function HeroRotator() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cycle, setCycle] = useState(0);
  const indexRef = useRef(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [],
  );

  function show(n: number) {
    const next = wrap(n);
    indexRef.current = next;
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    // Read live reduced-motion at call time so SSR/first paint never animates
    // before the effect above runs.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndex(next);
      return;
    }
    setFading(true);
    fadeTimer.current = setTimeout(() => {
      setIndex(next);
      setFading(false);
    }, FADE_MS);
  }

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = setInterval(() => show(indexRef.current + 1), ROTATE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, paused, cycle]);

  function goTo(n: number) {
    show(n);
    setCycle((c) => c + 1); // restart the auto-advance cadence
  }

  const example = HERO_EXAMPLES[index];

  return (
    <div
      className="hero-preview"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="preview-top">
        <span className="eyebrow">LEAMOS ENTRE LÍNEAS</span>
        <span className="example-tag">Ejemplo ilustrativo</span>
      </div>
      <div className={`hero-rot${fading ? " is-fading" : ""}`}>
        <div className="quote-paper">
          <div className="paper-heading">
            <span>COTIZACIÓN</span>
            <span>
              0{index + 1} / 0{HERO_EXAMPLES.length}
            </span>
          </div>
          <h3>{example.title}</h3>
          <p>{example.sub}</p>
          <div className="paper-total">
            <strong>{example.total}</strong>
            <span>{example.totalNote}</span>
          </div>
          <div className="paper-question">
            <span>{example.gapLabel}</span>
            <span>
              {example.gapValue} <b>?</b>
            </span>
          </div>
        </div>
        <div className="finding-preview">
          <span className="finding-icon">!</span>
          <div>
            <span className="label">{example.findingLabel}</span>
            <h3>{example.findingQuestion}</h3>
            <p>{example.findingText}</p>
          </div>
        </div>
        <div className="copy-preview">
          <span className="label">UNA PREGUNTA QUE SÍ PUEDES HACER</span>
          <p>“{example.suggestedQuestion}”</p>
          <a href="#ejemplo">
            Ver el reporte de ejemplo <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="hero-dots" role="group" aria-label="Ver otro ejemplo">
        {HERO_EXAMPLES.map((e, i) => (
          <button
            key={e.title}
            type="button"
            className={i === index ? "active" : ""}
            onClick={() => goTo(i)}
            aria-label={`Ejemplo ${i + 1}: ${e.title}`}
          />
        ))}
      </div>
    </div>
  );
}

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="line"></span> COTIZACIONES, CON LAS COSAS CLARAS
        </div>
        <h1>
          Antes del sí,
          <br />
          <span>
            mira la<br />
            letra chica.
          </span>
        </h1>
        <p className="hero-description">
          Descubre qué falta dejar claro en una cotización{" "}
          <strong>antes de aceptarla.</strong>
        </p>
        <p className="hero-detail">
          Plazos, materiales, extras y responsabilidades. Te ayudamos a hacer
          las preguntas que faltan.
        </p>
        <div className="hero-actions">
          <button className="button blue" onClick={onStart}>
            Revisar mi cotización <span aria-hidden="true">↗</span>
          </button>
          <div className="price-inline">
            <strong>S/39</strong>
            <span>por revisión · pago único</span>
          </div>
        </div>
        <div className="micro-trust">
          Sin cuenta <span>·</span> Sin suscripción <span>·</span> PDF, foto o
          captura
        </div>
      </div>
      <HeroRotator />
    </section>
  );
}
