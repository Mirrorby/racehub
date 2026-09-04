interface AppHeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function AppHeader({ title, action }: AppHeaderProps) {
  return (
    <header className="rh-app-header">
      <span className="rh-app-header__title">{title}</span>
      {action}
    </header>
  );
}
