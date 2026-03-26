interface StatusBarProps {
  model: string;
  graphSummary: string;
  modulesSummary: string;
}

export function StatusBar({ model, graphSummary, modulesSummary }: StatusBarProps): JSX.Element {
  return (
    <footer className="statusbar">
      <span>Assistant model: {model}</span>
      <span>{graphSummary}</span>
      <span>{modulesSummary}</span>
      <span className="muted">Tip: open Trust Center to inspect ownership and runtime methods.</span>
    </footer>
  );
}
