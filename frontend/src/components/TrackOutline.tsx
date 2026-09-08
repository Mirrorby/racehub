import { useEffect, useRef, useState } from "react";
import { placeholders } from "../assets/assets";

/**
 * Направление обхода контура относительно порядка точек в исходном SVG-файле
 * (см. frontend/public/assets/tracks/*.svg, источник julesr0y/f1-circuits-svg).
 * Файлы рисуют контур в произвольном направлении, не обязательно совпадающем
 * с реальным направлением гонки — поэтому по умолчанию везде false, и это
 * нужно один раз проверить глазами по каждой трассе (сверить с трансляцией/
 * официальной схемой) и проставить true там, где импульс должен идти в
 * обратную сторону. Сделано намеренно явным списком, а не автоматическим
 * определением — направление гонки не выводится из одной лишь формы пути.
 */
const REVERSE_DIRECTION: Record<string, boolean> = {
  // "spa": true,
};

interface TrackOutlineProps {
  circuitId?: string;
  className?: string;
  /** Показывать бегущий импульс. По умолчанию true; на мелких превью (Calendar) может быть не нужен. */
  animated?: boolean;
}

const cache = new Map<string, Promise<string | null>>();

function loadTrackSvg(circuitId: string): Promise<string | null> {
  if (!cache.has(circuitId)) {
    const promise = fetch(`/assets/tracks/${circuitId}.svg`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    cache.set(circuitId, promise);
  }
  return cache.get(circuitId)!;
}

/**
 * Инлайнит SVG контура трассы в DOM (обязательно инлайн, не <img src=...> —
 * currentColor и анимация stroke-dashoffset не работают через внешний
 * img-тег, см. аудит редизайна от 07.09.2026). Источник — наши собственные
 * статические файлы в /public/assets/tracks, не пользовательский ввод.
 */
type LoadState = "loading" | "ready" | "missing";

export function TrackOutline({ circuitId, className, animated = true }: TrackOutlineProps) {
  const [markup, setMarkup] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setMarkup(null);
    setState("loading");
    if (!circuitId) {
      setState("missing");
      return;
    }
    loadTrackSvg(circuitId).then((svg) => {
      if (!alive) return;
      if (svg) {
        setMarkup(svg);
        setState("ready");
      } else {
        setState("missing");
      }
    });
    return () => {
      alive = false;
    };
  }, [circuitId]);

  useEffect(() => {
    if (!markup || !wrapRef.current) return;
    const path = wrapRef.current.querySelector("path");
    if (!path) return;
    // pathLength нормализует контур к 1000 условных единиц вне зависимости
    // от реальной геометрии — так один и тот же keyframes-набор в CSS
    // работает одинаково для трассы любой длины и формы.
    path.setAttribute("pathLength", "1000");
    path.classList.add("pp-track-outline__base");

    if (animated) {
      const impulse = path.cloneNode() as SVGPathElement;
      impulse.classList.remove("pp-track-outline__base");
      impulse.classList.add("pp-track-outline__impulse");
      if (circuitId && REVERSE_DIRECTION[circuitId]) {
        impulse.classList.add("pp-track-outline__impulse--reverse");
      }
      path.after(impulse);
      return () => impulse.remove();
    }
  }, [markup, animated, circuitId]);

  if (state === "missing") {
    // трасса ещё не добавлена в комплект (см. docs/ASSET_MAPPING.md) — тихий
    // нейтральный плейсхолдер вместо пустого места или сломанной картинки
    return (
      <img
        className={`pp-track-outline pp-track-outline--placeholder ${className ?? ""}`}
        src={placeholders.trackPlaceholder}
        alt=""
      />
    );
  }

  if (state === "loading" || !markup) {
    return <div ref={wrapRef} className={`pp-track-outline ${className ?? ""}`} aria-hidden />;
  }

  return (
    <div
      ref={wrapRef}
      className={`pp-track-outline ${className ?? ""}`}
      aria-hidden
      // markup приходит из наших собственных файлов в /public/assets/tracks,
      // не из пользовательского ввода или сети третьих лиц.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
