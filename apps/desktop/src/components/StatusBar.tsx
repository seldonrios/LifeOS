interface StatusBarProps {
  model: string;
  graphSummary: string;
  modulesSummary: string;
}

export function StatusBar({ model, graphSummary, modulesSummary }: StatusBarProps): JSX.Element {
  return (
    <footer className="statusbar">
      <span>Model: {model}</span>
      <span>{graphSummary}</span>
      <span>{modulesSummary}</span>
    </footer>
  );
}
