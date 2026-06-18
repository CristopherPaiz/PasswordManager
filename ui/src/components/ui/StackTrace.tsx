interface StackTraceProps {
  stack: string;
  className?: string;
}

// Frame de stack: "    at fnName (archivo:linea:col)" o "    at archivo:linea:col".
const FRAME_RE = /^(\s*at\s+)(?:(.+?)\s+\()?(.+?):(\d+):(\d+)(\)?)\s*$/;

const StackLine = ({ line }: { line: string }) => {
  const match = line.match(FRAME_RE);

  // Líneas que no son frame (tipo/mensaje del error) → resaltadas en rojo.
  if (!match) {
    return <div className="text-red-600 dark:text-red-400">{line || " "}</div>;
  }

  const [, at, fn, file, ln, col, close] = match;

  return (
    <div>
      <span className="text-text-muted">{at}</span>
      {fn && (
        <>
          <span className="text-primary-500 font-medium">{fn}</span>
          <span className="text-text-muted"> (</span>
        </>
      )}
      <span className="text-text-base">{file}</span>
      <span className="text-text-muted">:</span>
      <span className="text-amber-600 dark:text-amber-400">{ln}</span>
      <span className="text-text-muted">:</span>
      <span className="text-amber-600 dark:text-amber-400">{col}</span>
      {close && <span className="text-text-muted">{close}</span>}
    </div>
  );
};

// Stack trace con resaltado: función en color de marca, archivo, números de
// línea/columna en ámbar, y la cabecera del error en rojo. Sin dependencias.
export const StackTrace = ({ stack, className = "" }: StackTraceProps) => {
  const lines = stack.split("\n");

  return (
    <pre className={`text-xs bg-bg-base border border-border-base rounded-xl p-3 overflow-x-auto whitespace-pre font-mono leading-relaxed ${className}`}>
      {lines.map((line, index) => (
        <StackLine key={index} line={line} />
      ))}
    </pre>
  );
};
