import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/calendar", label: "Calendar", icon: "📅", end: false },
  { to: "/standings", label: "Standings", icon: "🏆", end: false },
  { to: "/more", label: "More", icon: "•••", end: false },
] as const;

export function BottomNavigation() {
  return (
    <nav className="rh-bottom-nav">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className="rh-bottom-nav__item"
          data-testid={`nav-${tab.label.toLowerCase()}`}
        >
          {({ isActive }) => (
            <span data-rh-nav-item data-active={isActive}>
              <span className="rh-bottom-nav__icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
