import React, { useMemo } from 'react';
import katex from 'katex';
import { verbalizeMath } from '../../utils/mathVerbalizer';

interface MathEquationProps {
  latex: string;
  displayMode?: boolean;
  verbalOverride?: string;
  className?: string;
}

export const MathEquation: React.FC<MathEquationProps> = ({
  latex,
  displayMode = false,
  verbalOverride,
  className = '',
}) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
      });
    } catch {
      return latex;
    }
  }, [latex, displayMode]);

  const verbalDescription = useMemo(() => {
    return verbalOverride || verbalizeMath(latex);
  }, [latex, verbalOverride]);

  return (
    <span className={`inline-flex items-center gap-1 max-w-full ${className}`}>
      {/* Visual math presentation hidden from screen readers to prevent gibberish */}
      <span
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: html }}
        className="text-theme-text select-none max-w-full overflow-x-auto"
      />
      {/* Screen-reader verbal speech equivalent */}
      <span className="sr-only">
        Equation: {verbalDescription}
      </span>
    </span>
  );
};
