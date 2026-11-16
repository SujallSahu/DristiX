import { verbalizeMath, verbalizeForSpeech } from './mathVerbalizer';
import type { QuestionGraph, AiDiagramExplanation } from '../../shared/types';

export interface QuadraticAnalysis {
  a: number;
  b: number;
  c: number;
  variable: string;
  discriminant: number;
  rootNature: 'real_distinct_rational' | 'real_distinct_irrational' | 'real_equal' | 'complex';
  roots?: { root1: number | string; root2: number | string };
  vertex: { x: number; y: number };
  opensUpward: boolean;
  factorizationHint?: string;
}

/**
 * Parses a quadratic expression or equation in standard polynomial form.
 * Handles forms like:
 *   "2x^2 - 7x + 3 = 0"
 *   "x^2 - 5x + 6"
 *   "-3t^2 + 12t - 9 = 0"
 *   "y^2 - 16 = 0"
 */
export function parseQuadratic(latexOrText: string): QuadraticAnalysis | null {
  if (!latexOrText) return null;

  // Clean whitespace, LaTeX text tags, and normalize
  const clean = latexOrText
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\quad|\\qquad|\\,|\\;/g, ' ')
    .replace(/\s+/g, '')
    .replace(/=0$/, '')
    .trim();

  // Match quadratic term: [sign and number][variable]^2 or [variable]2
  const quadMatch = clean.match(/([+-]?[0-9]*(?:\.[0-9]+)?)([a-zA-Z])(?:\^2|\^\{2\}|2)/);
  if (!quadMatch) return null;

  const varName = quadMatch[2];
  const aStr = quadMatch[1];
  let a = 1;
  if (aStr === '' || aStr === '+') a = 1;
  else if (aStr === '-') a = -1;
  else a = parseFloat(aStr);

  if (isNaN(a) || a === 0) return null;

  // Remove the quadratic term to inspect the rest
  const afterQuad = clean.replace(quadMatch[0], '');

  // Match linear term: [sign and number][variable] (ensure not variable^2)
  const linRegex = new RegExp(`([+-]?[0-9]*(?:\\.[0-9]+)?)${varName}(?!\\^|2)`);
  const linMatch = afterQuad.match(linRegex);

  let b = 0;
  let remaining = afterQuad;
  if (linMatch) {
    const bStr = linMatch[1];
    if (bStr === '' || bStr === '+') b = 1;
    else if (bStr === '-') b = -1;
    else b = parseFloat(bStr);
    remaining = afterQuad.replace(linMatch[0], '');
  }

  // Match constant term in remaining string
  const constMatch = remaining.match(/([+-]?[0-9]+(?:\.[0-9]+)?)/);
  let c = 0;
  if (constMatch) {
    c = parseFloat(constMatch[1]);
  }

  // Calculate Discriminant: D = b^2 - 4ac
  const discriminant = b * b - 4 * a * c;

  // Analyze nature of roots
  let rootNature: QuadraticAnalysis['rootNature'];
  let roots: { root1: number | string; root2: number | string } | undefined;

  const isPerfectSquare = (n: number): boolean => {
    if (n < 0) return false;
    const s = Math.round(Math.sqrt(n));
    return s * s === n;
  };

  if (discriminant > 0) {
    if (isPerfectSquare(discriminant)) {
      rootNature = 'real_distinct_rational';
      const sqrtD = Math.sqrt(discriminant);
      const r1 = (-b + sqrtD) / (2 * a);
      const r2 = (-b - sqrtD) / (2 * a);
      roots = {
        root1: Number(r1.toFixed(3)),
        root2: Number(r2.toFixed(3)),
      };
    } else {
      rootNature = 'real_distinct_irrational';
      const sqrtD = Math.sqrt(discriminant);
      const r1 = (-b + sqrtD) / (2 * a);
      const r2 = (-b - sqrtD) / (2 * a);
      roots = {
        root1: Number(r1.toFixed(3)),
        root2: Number(r2.toFixed(3)),
      };
    }
  } else if (discriminant === 0) {
    rootNature = 'real_equal';
    const r = -b / (2 * a);
    roots = {
      root1: Number(r.toFixed(3)),
      root2: Number(r.toFixed(3)),
    };
  } else {
    rootNature = 'complex';
    const realPart = Number((-b / (2 * a)).toFixed(3));
    const imagPart = Number((Math.sqrt(-discriminant) / (2 * Math.abs(a))).toFixed(3));
    roots = {
      root1: `${realPart} + ${imagPart}i`,
      root2: `${realPart} - ${imagPart}i`,
    };
  }

  // Vertex of parabola: (-b/(2a), c - b^2/(4a))
  const vertexX = Number((-b / (2 * a)).toFixed(3));
  const vertexY = Number((c - (b * b) / (4 * a)).toFixed(3));
  const opensUpward = a > 0;

  // Factorization hint if rational
  let factorizationHint: string | undefined;
  if (rootNature === 'real_distinct_rational' || rootNature === 'real_equal') {
    const ac = a * c;
    factorizationHint = `Split the middle term ${b >= 0 ? `+${b}` : b}${varName} into two numbers whose product is ${ac} and sum is ${b}.`;
  }

  return {
    a,
    b,
    c,
    variable: varName,
    discriminant,
    rootNature,
    roots,
    vertex: { x: vertexX, y: vertexY },
    opensUpward,
    factorizationHint,
  };
}

/**
 * Detailed explanation generator for Mathematical Equations & Quadratic Formulas.
 * Supports both Practice Arena mode (gives pedagogical derivations & factorization hints)
 * and Timed Mock Exam mode (explains structure and coefficients without breaking test integrity).
 */
export function explainEquation(
  latex: string,
  isHindi: boolean,
  options?: { isPractice?: boolean; questionText?: string }
): {
  isQuadratic: boolean;
  title: string;
  speech: string;
  details: string;
} {
  if (!latex || !latex.trim()) {
    const emptySpeech = isHindi
      ? 'इस प्रश्न में कोई गणितीय समीकरण उपलब्ध नहीं है।'
      : 'No mathematical equation is associated with this question.';
    return { isQuadratic: false, title: 'No Equation', speech: emptySpeech, details: '' };
  }

  const quad = parseQuadratic(latex);
  const isPractice = !!options?.isPractice;
  const verbalEquation = verbalizeMath(latex);

  if (quad) {
    const { a, b, c, variable, discriminant, rootNature, roots, opensUpward, factorizationHint } = quad;

    let rootNatureDescEn = '';
    let rootNatureDescHi = '';
    if (rootNature === 'real_distinct_rational') {
      rootNatureDescEn = 'two real, distinct, and rational roots';
      rootNatureDescHi = 'दो वास्तविक, भिन्न और परिमेय मूल (roots)';
    } else if (rootNature === 'real_distinct_irrational') {
      rootNatureDescEn = 'two real and distinct irrational roots';
      rootNatureDescHi = 'दो वास्तविक और अपरिमेय मूल (irrational roots)';
    } else if (rootNature === 'real_equal') {
      rootNatureDescEn = 'two real and equal roots (a repeated root)';
      rootNatureDescHi = 'दो वास्तविक और समान मूल (single repeated root)';
    } else {
      rootNatureDescEn = 'two complex conjugate roots with imaginary numbers';
      rootNatureDescHi = 'दो सम्मिश्र / काल्पनिक मूल (complex roots)';
    }

    const parabolaDirectionEn = opensUpward ? 'opens upward' : 'opens downward';
    const parabolaDirectionHi = opensUpward ? 'ऊपर की ओर खुलता है' : 'नीचे की ओर खुलता है';

    if (isHindi) {
      let speech = `द्विघात समीकरण का विस्तृत विश्लेषण: दिया गया समीकरण है "${verbalEquation}"। यह मानक रूप 'a ${variable} squared plus b ${variable} plus c बराबर 0' में है। यहाँ द्विघात गुणांक a बराबर ${a}, रैखिक गुणांक b बराबर ${b}, और अचर पद c बराबर ${c} है। विविक्तकर (डिस्क्रिमिनेंट) b² - 4ac का मान ${discriminant} है। क्योंकि विविक्तकर ${discriminant >= 0 ? (discriminant === 0 ? 'शून्य' : 'धनात्मक') : 'ऋणात्मक'} है, इसलिए इस समीकरण के ${rootNatureDescHi} होंगे। परवलय (पैराबोला) का ग्राफ ${parabolaDirectionHi}।`;

      if (isPractice && roots) {
        speech += ` प्रैक्टिस ड्रिल सहायता: द्विघात सूत्र x = (-b ± √D) / (2a) का उपयोग करके मूल ${roots.root1} और ${roots.root2} प्राप्त होते हैं। ${factorizationHint ? `गुणनखंड विधि: ${factorizationHint}` : ''}`;
      } else {
        speech += ` हल करने की विधि: आप द्विघात सूत्र x = (-b ± √D) / (2a) का उपयोग कर सकते हैं या मध्य पद का विभाजन करके गुणनखंड प्राप्त कर सकते हैं।`;
      }

      return {
        isQuadratic: true,
        title: 'द्विघात समीकरण विश्लेषण (Quadratic Equation)',
        speech,
        details: `a = ${a}, b = ${b}, c = ${c} | D = ${discriminant} (${rootNature})`,
      };
    } else {
      let speech = `Detailed Quadratic Equation Breakdown: The given equation is "${verbalEquation}". It is structured in standard second-degree polynomial form: 'a ${variable} squared plus b ${variable} plus c equals 0'. The leading quadratic coefficient a is ${a}, linear coefficient b is ${b}, and constant term c is ${c}. The discriminant (b squared minus 4ac) calculates to ${discriminant}. Since the discriminant is ${discriminant > 0 ? 'positive' : discriminant === 0 ? 'zero' : 'negative'}, the equation has ${rootNatureDescEn}. Graphically, the parabola ${parabolaDirectionEn}.`;

      if (isPractice && roots) {
        speech += ` Practice Drill Guidance: Applying the quadratic formula x = (-b ± √D) / 2a yields the roots ${roots.root1} and ${roots.root2}. ${factorizationHint ? `Factorization method: ${factorizationHint}` : ''}`;
      } else {
        speech += ` Recommended approach: You can solve this by applying the quadratic formula x = (-b ± √D) / 2a, or by factoring the polynomial through middle-term splitting.`;
      }

      return {
        isQuadratic: true,
        title: 'Quadratic Equation Analysis',
        speech,
        details: `a = ${a}, b = ${b}, c = ${c} | D = ${discriminant} (${rootNature})`,
      };
    }
  }

  // General mathematical formula / equation fallback (e.g. geometry circumference, trigonometry, physics)
  if (isHindi) {
    const speech = `गणितीय समीकरण विश्लेषण: प्रश्न में दिया गया समीकरण है "${verbalEquation}"। यह समस्या को हल करने के लिए मुख्य बीजगणितीय संबंध को दर्शाता है। प्रश्न के मानों को इस समीकरण में प्रतिस्थापित करके अभीष्ट परिणाम प्राप्त करें।`;
    return {
      isQuadratic: false,
      title: 'गणितीय समीकरण (Mathematical Equation)',
      speech,
      details: verbalEquation,
    };
  } else {
    const speech = `Mathematical Equation Breakdown: The equation specified for this problem is "${verbalEquation}". This formula establishes the algebraic relationship required to solve the question. Substitute the known given values into this relation to calculate your result.`;
    return {
      isQuadratic: false,
      title: 'Mathematical Equation',
      speech,
      details: verbalEquation,
    };
  }
}

/**
 * Detailed explanation generator for Charts and Data Interpretation Graphs (Bar, Line, Pie).
 * Articulates axes, units, chronological data points, peak/lowest metrics, and trend trajectory.
 */
export function explainGraph(
  graph: QuestionGraph,
  isHindi: boolean
): {
  title: string;
  speech: string;
  summary: string;
} {
  const { type, title, xAxisLabel, yAxisLabel, unit, data } = graph;

  if (!data || data.length === 0) {
    const noData = isHindi
      ? 'इस ग्राफ में कोई डेटा बिंदु उपलब्ध नहीं है।'
      : 'This graph does not contain any data points.';
    return { title: title || 'Graph', speech: noData, summary: noData };
  }

  const unitText = unit ? ` ${unit}` : '';
  const unitTextHi = unit ? ` ${unit}` : '';

  // Calculate statistics
  let maxPoint = data[0];
  let minPoint = data[0];
  let sum = 0;

  data.forEach((p) => {
    sum += p.value;
    if (p.value > maxPoint.value) maxPoint = p;
    if (p.value < minPoint.value) minPoint = p;
  });

  const average = Number((sum / data.length).toFixed(2));

  // Graph type names
  const typeMap: Record<string, { en: string; hi: string }> = {
    bar: { en: 'Bar Chart', hi: 'बार चार्ट (Bar Chart)' },
    line: { en: 'Line Graph', hi: 'लाइन ग्राफ (Line Graph)' },
    pie: { en: 'Pie Chart', hi: 'पाई चार्ट (Pie Chart)' },
  };

  const chartTypeNameEn = typeMap[type]?.en || 'Data Graph';
  const chartTypeNameHi = typeMap[type]?.hi || 'डेटा ग्राफ';

  // Overall trajectory narrative
  let trajectoryEn = '';
  let trajectoryHi = '';
  if (data.length >= 2) {
    const first = data[0];
    const last = data[data.length - 1];
    if (last.value > first.value) {
      trajectoryEn = `Overall trajectory shows an upward increase from ${first.value}${unitText} in ${first.label} to ${last.value}${unitText} in ${last.label}.`;
      trajectoryHi = `समग्र रुझान ${first.label} में ${first.value}${unitTextHi} से बढ़कर ${last.label} में ${last.value}${unitTextHi} तक ऊपर जाता है।`;
    } else if (last.value < first.value) {
      trajectoryEn = `Overall trajectory exhibits a downward decline from ${first.value}${unitText} in ${first.label} to ${last.value}${unitText} in ${last.label}.`;
      trajectoryHi = `समग्र रुझान ${first.label} में ${first.value}${unitTextHi} से घटकर ${last.label} में ${last.value}${unitTextHi} तक नीचे आता है।`;
    } else {
      trajectoryEn = `Overall values begin and conclude at ${first.value}${unitText}.`;
      trajectoryHi = `समग्र मान ${first.label} और ${last.label} दोनों में ${first.value}${unitTextHi} पर समान रहते हैं।`;
    }
  }

  // Data point enumerations
  const pointsListEn = data
    .map((p, idx) => {
      const isPeak = p.id === maxPoint.id ? ' (Peak Value)' : '';
      const isLowest = p.id === minPoint.id && p.id !== maxPoint.id ? ' (Lowest Value)' : '';
      return `Point ${idx + 1}: ${p.label} with ${p.value}${unitText}${isPeak}${isLowest}`;
    })
    .join('. ');

  const pointsListHi = data
    .map((p, idx) => {
      const isPeak = p.id === maxPoint.id ? ' (सर्वोच्च शिखर मान)' : '';
      const isLowest = p.id === minPoint.id && p.id !== maxPoint.id ? ' (न्यूनतम मान)' : '';
      return `बिंदु ${idx + 1}: ${p.label} में ${p.value}${unitTextHi}${isPeak}${isLowest}`;
    })
    .join('। ');

  if (isHindi) {
    const titleLead = title ? `शीर्षक "${title}"` : 'डेटा चार्ट';
    const speech = `चार्ट और ग्राफ का विस्तृत विश्लेषण: यह एक ${chartTypeNameHi} है जिसका ${titleLead} है। एक्स-अक्ष पर ${xAxisLabel || 'श्रेणी'} और वाई-अक्ष पर ${yAxisLabel || 'मान'}${unit ? ` (${unit} में)` : ''} दर्शाया गया है। इसमें कुल ${data.length} डेटा बिंदु हैं। पूर्ण डेटा बिंदु इस प्रकार हैं: ${pointsListHi}। सांख्यिकीय सारांश: उच्चतम मान ${maxPoint.label} में ${maxPoint.value}${unitTextHi} है, न्यूनतम मान ${minPoint.label} में ${minPoint.value}${unitTextHi} है, और सभी बिंदुओं का औसत ${average}${unitTextHi} है। ${trajectoryHi} आप इंटरएक्टिव ऑडियो टोन सुनने के लिए बाएँ और दाएँ एरो कीज़ का भी उपयोग कर सकते हैं।`;

    const summary = `${chartTypeNameHi}: ${title || 'डेटा ग्राफ'}, कुल ${data.length} बिंदु। उच्चतम: ${maxPoint.value}${unitTextHi} (${maxPoint.label}), न्यूनतम: ${minPoint.value}${unitTextHi} (${minPoint.label}), औसत: ${average}${unitTextHi}।`;

    return {
      title: title || chartTypeNameHi,
      speech,
      summary,
    };
  } else {
    const titleLead = title ? `titled "${title}"` : 'data chart';
    const speech = `Comprehensive Visual Chart & Graph Breakdown: This is a ${chartTypeNameEn} ${titleLead}. The horizontal X-axis represents ${xAxisLabel || 'Category'}, and the vertical Y-axis denotes ${yAxisLabel || 'Values'}${unit ? ` measured in ${unit}` : ''}. The graph contains ${data.length} sequential data points: ${pointsListEn}. Key statistical benchmarks: Peak maximum value is ${maxPoint.value}${unitText} in ${maxPoint.label}, minimum lowest value is ${minPoint.value}${unitText} in ${minPoint.label}, and the overall dataset average is ${average}${unitText}. ${trajectoryEn} Accessible pitch sonification is enabled: you can navigate through the data points using your Left and Right arrow keys to hear the corresponding audio frequencies.`;

    const summary = `${chartTypeNameEn}: ${title || 'Data Graph'} with ${data.length} points. Peak: ${maxPoint.value}${unitText} (${maxPoint.label}), Lowest: ${minPoint.value}${unitText} (${minPoint.label}), Average: ${average}${unitText}.`;

    return {
      title: title || chartTypeNameEn,
      speech,
      summary,
    };
  }
}

/**
 * Detailed explanation generator for Visual Diagrams, Geometry, and Technical Illustrations.
 */
export function explainDiagram(
  question: {
    questionNumber?: number;
    number?: number;
    diagramAiExplanation?: AiDiagramExplanation;
    diagramDescription?: string;
    diagramUrl?: string;
    diagramType?: string;
    graph?: QuestionGraph;
    equationLatex?: string;
    mathLatex?: string;
  },
  isHindi: boolean
): {
  title: string;
  speech: string;
} {
  const qNum = question.questionNumber ?? question.number ?? 1;

  // 1. If it has a graph, prioritize rich graph explanation
  if (question.graph && question.graph.enabled && question.graph.data?.length) {
    const res = explainGraph(question.graph, isHindi);
    return { title: res.title, speech: res.speech };
  }

  // 2. If it has AI Diagram Explanation
  if (question.diagramAiExplanation) {
    const ai = question.diagramAiExplanation;
    const narration = ai.audioNarration?.trim();
    const breakdown = Array.isArray(ai.visualBreakdown) && ai.visualBreakdown.length > 0
      ? ai.visualBreakdown.join(' ')
      : '';
    const context = ai.educationalContext?.trim();

    if (isHindi) {
      const speech = `प्रश्न ${qNum} के दृश्य आरेख (विजुअल डायग्राम) का विश्लेषण: ${narration || breakdown || 'डायग्राम में ज्यामितीय और भौतिक संरचना प्रदर्शित है।'} ${context ? `शैक्षणिक संदर्भ: ${context}` : ''}`;
      return { title: `प्रश्न ${qNum} डायग्राम विश्लेषण`, speech };
    } else {
      const speech = `Visual Diagram Breakdown for Question ${qNum}: ${narration || breakdown || 'The diagram illustrates the structural geometry and labeled elements for this problem.'} ${context ? `Educational context: ${context}` : ''}`;
      return { title: `Question ${qNum} Diagram Explanation`, speech };
    }
  }

  // 3. If it has diagramDescription
  if (question.diagramDescription) {
    if (isHindi) {
      const speech = `प्रश्न ${qNum} के विजुअल आरेख का विवरण: ${verbalizeForSpeech(question.diagramDescription)}। यह आरेख समस्या के मुख्य घटकों और ज्यामितीय संबंधों को दर्शाता है।`;
      return { title: `प्रश्न ${qNum} आरेख`, speech };
    } else {
      const speech = `Visual Diagram Breakdown for Question ${qNum}: ${verbalizeForSpeech(question.diagramDescription)}. This visual layout defines the primary geometric relationships and labeled components for this problem.`;
      return { title: `Question ${qNum} Diagram Breakdown`, speech };
    }
  }

  // 4. If it has diagramUrl but no cached text
  if (question.diagramUrl) {
    if (isHindi) {
      const speech = `प्रश्न ${qNum} में एक विजुअल आरेख संलग्न है। AI डायग्राम एक्सप्लोरर विंडो खोल दी गई है ताकि आप सभी दृश्य विवरण और ज़ूम दृश्य देख सकें।`;
      return { title: `प्रश्न ${qNum} डायग्राम`, speech };
    } else {
      const speech = `Question ${qNum} has an attached visual diagram. I have opened the AI Diagram Explainer modal so you can inspect the visual illustration with enhanced magnification and high contrast.`;
      return { title: `Question ${qNum} Diagram`, speech };
    }
  }

  // 5. Fallback
  const fallback = isHindi
    ? `प्रश्न ${qNum} में कोई अलग दृश्य आरेख या चार्ट संलग्न नहीं है। आप प्रश्न को सुनने के लिए "प्रश्न पढ़ो" कह सकते हैं।`
    : `Question ${qNum} does not have an attached visual diagram or chart. Say "Read question" to hear the full problem statement.`;

  return { title: `Question ${qNum}`, speech: fallback };
}
