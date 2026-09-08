import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "./Icon";
import { useI18n } from "../i18n/I18nContext";

const TABS = [
  { to: "/", label: "home", icon: "home", end: true },
  { to: "/calendar", label: "calendar", icon: "calendar", end: false },
  { to: "/championship", label: "championship", icon: "trophy", end: false },
  { to: "/more", label: "more", icon: "more", end: false },
] as const;

export function BottomNavigation() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => { const y = window.scrollY; const delta = y - lastY.current; if (Math.abs(delta) > 18) { setHidden(delta > 0 && y > 80); lastY.current = y; } };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className="rh-bottom-nav" data-hidden={hidden} aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className="rh-bottom-nav__item"
          aria-label={t(tab.label)}
        >
          {({ isActive }) => (
            <span data-rh-nav-item data-active={isActive}>
              <span className="rh-bottom-nav__icon"><Icon name={tab.icon} /></span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
