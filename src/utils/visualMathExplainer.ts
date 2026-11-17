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
  if (/\\implies|\\Rightarrow/i.test(latexOrText)) return null;

  // Clean whitespace, LaTeX text tags, and normalize
  const clean = latexOrText
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\quad|\\qquad|\\,|\\;/g, ' ')
    .replace(/\s+/g, '')
    .replace(/=0$/, '')
    .trim();

  // A quadratic polynomial/equation only contains a single variable (e.g. x, t, y)
  const allVars = clean.match(/[a-zA-Z]/g) || [];
  const uniqueVars = new Set(allVars);
  if (uniqueVars.size !== 1) return null;

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
  const verbalEquation = verbalizeMath(latex, isHindi ? 'hi' : 'en');

  if (quad) {
    const { a, b, c, variable, discriminant, rootNature, roots, opensUpward, factorizationHint } = quad;

    let rootNatureDescEn = '';
    let rootNatureDescHi = '';
    if (rootNature === 'real_distinct_rational') {
      rootNatureDescEn = 'two real, distinct, and rational roots';
      rootNatureDescHi = 'दो वास्तविक, भिन्न और परिमेय मूल (Real, Distinct & Rational roots)';
    } else if (rootNature === 'real_distinct_irrational') {
      rootNatureDescEn = 'two real and distinct irrational roots';
      rootNatureDescHi = 'दो वास्तविक और अपरिमेय मूल (Real & Irrational roots)';
    } else if (rootNature === 'real_equal') {
      rootNatureDescEn = 'two real and equal roots (a repeated root)';
      rootNatureDescHi = 'दो वास्तविक और समान मूल (Real & Equal repeated roots)';
    } else {
      rootNatureDescEn = 'two complex conjugate roots with imaginary numbers';
      rootNatureDescHi = 'दो सम्मिश्र / काल्पनिक मूल (Complex Imaginary roots)';
    }

    const parabolaDirectionEn = opensUpward ? 'opens upward' : 'opens downward';
    const parabolaDirectionHi = opensUpward ? 'ऊपर की ओर खुलता है' : 'नीचे की ओर खुलता है';

    if (isHindi) {
      let speech = `द्विघात समीकरण का विस्तृत विश्लेषण: दिया गया समीकरण है "${verbalEquation}"। यह मानक द्विघात रूप 'a ${variable} का वर्ग + b ${variable} + c = 0' में है। यहाँ द्विघात गुणांक a बराबर ${a}, रैखिक गुणांक b बराबर ${b}, और अचर पद c बराबर ${c} है। विविक्तकर (डिस्क्रिमिनेंट) D = b² - 4ac का मान ${discriminant} है। क्योंकि विविक्तकर ${discriminant >= 0 ? (discriminant === 0 ? 'शून्य' : 'धनात्मक') : 'ऋणात्मक'} है, इसलिए इस समीकरण के ${rootNatureDescHi} होंगे। परवलय (पैराबोला) का ग्राफ ${parabolaDirectionHi} और इसका शीर्ष बिंदु (${quad.vertex.x}, ${quad.vertex.y}) है।`;

      if (isPractice && roots) {
        speech += ` प्रैक्टिस ड्रिल सहायता: द्विघात सूत्र x = (-b ± √D) / (2a) का उपयोग करके मूल x₁ = ${roots.root1} और x₂ = ${roots.root2} प्राप्त होते हैं। ${factorizationHint ? `गुणनखंड विधि: ${factorizationHint}` : ''}`;
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
      let speech = `Detailed Quadratic Equation Breakdown: The given equation is "${verbalEquation}". It is structured in standard second-degree polynomial form: 'a ${variable} squared plus b ${variable} plus c equals 0'. The leading quadratic coefficient a is ${a}, linear coefficient b is ${b}, and constant term c is ${c}. The discriminant (b squared minus 4ac) calculates to ${discriminant}. Since the discriminant is ${discriminant > 0 ? 'positive' : discriminant === 0 ? 'zero' : 'negative'}, the equation has ${rootNatureDescEn}. Graphically, the parabola ${parabolaDirectionEn} with vertex at (${quad.vertex.x}, ${quad.vertex.y}).`;

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

  // General mathematical formula / equation breakdown
  const cleanLatex = latex.trim();
  let specializedSpeechHi = '';
  let specializedSpeechEn = '';

  if (/km\/h|m\/s|\\frac\{5\}\{18\}/i.test(cleanLatex)) {
    specializedSpeechHi = `गति एवं चाल रूपांतरण सूत्र विश्लेषण: दिया गया व्यंजक है "${verbalEquation}"। किलोमीटर प्रति घंटा की चाल को मीटर प्रति सेकंड में बदलने के लिए 5 बटा 18 से गुणा किया जाता है, क्योंकि 1 किलोमीटर = 1000 मीटर और 1 घंटा = 3600 सेकंड होते हैं (1000 बटा 3600 = 5 बटा 18)। इस प्रकार 72 किमी/घंटा का मान ठीक 20 मीटर प्रति सेकंड प्राप्त होता है।`;
    specializedSpeechEn = `Speed & Velocity Conversion Formula Breakdown: The expression is "${verbalEquation}". To convert kilometers per hour into meters per second, multiply by 5/18 (since 1 km = 1000 m and 1 hour = 3600 seconds, giving 1000/3600 = 5/18). Thus 72 km/h evaluates precisely to 20 m/s.`;
  } else if (/\\angle|180\^\\circ/i.test(cleanLatex)) {
    specializedSpeechHi = `त्रिभुज के कोणों का ज्यामितीय विश्लेषण: दिया गया समीकरण है "${verbalEquation}"। समतल ज्यामिति के अनुसार किसी भी त्रिभुज के तीनों आंतरिक कोणों का योग हमेशा 180 अंश होता है। तीसरे कोण C का मान निकालने के लिए अन्य दो कोणों 60 अंश और 30 अंश के योग को 180 अंश में से घटाया गया है, जिससे कोण C = 90 अंश का समकोण प्राप्त होता है।`;
    specializedSpeechEn = `Triangle Angle Geometry Breakdown: The equation is "${verbalEquation}". In Euclidean geometry, the sum of all three interior angles in any planar triangle is strictly 180 degrees. To find angle C, the sum of interior angles 60° and 30° is subtracted from 180°, yielding 90° which confirms triangle ABC is a right-angled triangle.`;
  } else if (/2\\pi\s*r|\\pi\s*r\^2/i.test(cleanLatex)) {
    specializedSpeechHi = `वृत्त की परिधि एवं ज्यामिति सूत्र विश्लेषण: दिया गया व्यंजक है "${verbalEquation}"। वृत्त की परिधि का मानक सूत्र C = 2 × π × r है, जहाँ r त्रिज्या है और π का मान 22 बटा 7 लिया जाता है। 14 सेमी त्रिज्या के लिए यह मान 88 सेंटीमीटर प्राप्त होता है।`;
    specializedSpeechEn = `Circle Geometry & Circumference Formula Breakdown: The expression is "${verbalEquation}". The perimeter or circumference of a circle is calculated using C = 2 * pi * r, where r is radius and pi is approximated as 22/7. For a radius of 14 cm, this yields 88 cm.`;
  } else if (/a\^2\s*\+\s*b\^2\s*=\s*c\^2/i.test(cleanLatex)) {
    specializedSpeechHi = `पाइथागोरस प्रमेय का विस्तृत विश्लेषण: दिया गया समीकरण है "${verbalEquation}"। समकोण त्रिभुज के लिए पाइथागोरस प्रमेय a² + b² = c² है, जहाँ c कर्ण (सबसे लंबी भुजा) है और a तथा b आधार एवं लंब हैं। यहाँ 5² + b² = 13² से b² = 169 - 25 = 144, जिससे अज्ञात भुजा b = 12 प्राप्त होती है।`;
    specializedSpeechEn = `Pythagorean Theorem Breakdown: The equation is "${verbalEquation}". For any right-angled triangle, Pythagoras' theorem establishes that a² + b² = c², where c is the hypotenuse and a, b are the adjacent legs. Here 5² + b² = 13² gives b² = 169 - 25 = 144, so the missing leg b = 12.`;
  } else if (/\\frac\{1\}\{T\}/i.test(cleanLatex)) {
    specializedSpeechHi = `कार्य एवं समय सूत्र विश्लेषण: दिया गया समीकरण है "${verbalEquation}"। जब दो व्यक्ति मिलकर कार्य करते हैं, तो उनकी व्यक्तिगत कार्य दरों (1/A और 1/B) को जोड़कर संयुक्त कार्य दर 1/T प्राप्त की जाती है।`;
    specializedSpeechEn = `Time & Work Reciprocal Relationship: The equation is "${verbalEquation}". When two agents work in tandem, their individual rates of work (1/A and 1/B) are summed together to determine the combined rate 1/T.`;
  }

  if (isHindi) {
    const speech = specializedSpeechHi || `गणितीय संबंध विश्लेषण: प्रश्न में दिया गया व्यंजक है "${verbalEquation}"। यह समस्या को हल करने के लिए मुख्य बीजगणितीय संबंध को दर्शाता है। प्रश्न के मानों को इस समीकरण में प्रतिस्थापित करके अभीष्ट परिणाम प्राप्त करें।`;
    return {
      isQuadratic: false,
      title: 'गणितीय समीकरण (Mathematical Equation)',
      speech,
      details: verbalEquation,
    };
  } else {
    const speech = specializedSpeechEn || `Mathematical Equation Breakdown: The equation specified for this problem is "${verbalEquation}". This formula establishes the algebraic relationship required to solve the question. Substitute the known given values into this relation to calculate your result.`;
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
 * Translates geometric and technical visual descriptions into clear, natural Hindi.
 */
export function translateVisualDescriptionToHindi(text: string): string {
  if (!text) return '';
  let s = text.trim();

  // Multi-word full phrases first
  const phraseMap: [RegExp, string][] = [
    [/Visual geometry diagram:?\s*/gi, 'दृश्य ज्यामितीय आरेख: '],
    [/In Euclidean geometry,?\s*/gi, 'यूक्लिडियन ज्यामिति के अनुसार, '],
    [/the sum of all three interior angles in any triangle is exactly 180°\.?/gi, 'किसी भी त्रिभुज के तीनों आंतरिक कोणों का योग 180 अंश होता है।'],
    [/making triangle ([A-Za-z]+) a right-angled triangle at vertex ([A-Za-z]+)\.?/gi, 'जिससे त्रिभुज $1 शीर्ष $2 पर एक समकोण त्रिभुज बनता है।'],
    [/The two sides ([A-Za-z\s]+) and ([A-Za-z\s]+) intersect at vertex ([A-Za-z\s]+) at the top, forming interior angle ([A-Za-z\s]+)\.?/gi, 'दो भुजाएँ $1 और $2 शीर्ष $3 पर मिलती हैं, जिससे आंतरिक कोण $4 बनता है।'],
    [/Horizontal baseline segment ([A-Za-z\s]+) of length ([0-9.]+) cm running along the bottom/gi, 'निचले भाग में $2 सेमी लंबाई का क्षैतिज आधार रेखाखंड $1'],
    [/Vertex ([A-Za-z\s]+) at bottom-left labeled with interior angle arc ([0-9.]+)°/gi, 'निचले बाएँ भाग पर शीर्ष $1, $2 अंश का आंतरिक कोण चाप'],
    [/Vertex ([A-Za-z\s]+) at bottom-right labeled with interior angle arc ([0-9.]+)°/gi, 'निचले दाएँ भाग पर शीर्ष $1, $2 अंश का आंतरिक कोण चाप'],
    [/Apex vertex ([A-Za-z\s]+) positioned above the baseline forming a ([0-9.]+)° right angle/gi, 'आधार रेखा के ऊपर शीर्ष $1, जो $2 अंश का समकोण बनाता है'],
    [/Base side ([A-Za-z\s]+) is ([0-9.]+) centimeters long\.?/gi, 'आधार भुजा $1 की लंबाई $2 सेंटीमीटर है।'],
    [/Base ([A-Za-z\s]+) measures ([0-9.]+) cm\.?/gi, 'आधार $1 की माप $2 सेमी है।'],
    [/Interior angle ([A-Za-z\s]+) measures ([0-9.]+) degrees\.?/gi, 'आंतरिक कोण $1 का मान $2 अंश है।'],
    [/Interior angle ([A-Za-z\s]+) at vertex ([A-Za-z\s]+) is ([0-9.]+)°/gi, 'शीर्ष $2 पर आंतरिक कोण $1 का मान $3 अंश है'],
    [/angle ([A-Za-z\s]+) at vertex ([A-Za-z\s]+) is ([0-9.]+)°/gi, 'शीर्ष $2 पर कोण $1 का मान $3 अंश है'],
    [/Vertex ([A-Za-z\s]+) is located at the top where sides ([A-Za-z\s]+) and ([A-Za-z\s]+) meet\.?/gi, 'शीर्ष $1 ऊपर स्थित है जहाँ भुजाएँ $2 और $3 मिलती हैं।'],
    [/The diagram displays/gi, 'यह आरेख दर्शाता है कि'],
    [/The diagram illustrates/gi, 'यह आरेख स्पष्ट करता है कि'],
    [/Therefore,?\s*/gi, 'अतः '],
  ];

  for (const [rgx, rep] of phraseMap) {
    s = s.replace(rgx, rep);
  }

  // Word level replacements
  const wordMap: [RegExp, string][] = [
    [/\btriangle\s*([A-Za-z]+)\b/gi, 'त्रिभुज $1'],
    [/\btriangles?\b/gi, 'त्रिभुज'],
    [/\bright-angled triangle\b/gi, 'समकोण त्रिभुज'],
    [/\bright angle\b/gi, 'समकोण'],
    [/\bhypotenuse\b/gi, 'कर्ण'],
    [/\bbase side\b/gi, 'आधार भुजा'],
    [/\bbase\b/gi, 'आधार'],
    [/\binterior angle\b/gi, 'आंतरिक कोण'],
    [/\binterior angles\b/gi, 'आंतरिक कोणों'],
    [/\bangles?\b/gi, 'कोण'],
    [/\bvertices\b/gi, 'शीर्ष बिंदु'],
    [/\bvertex\b/gi, 'शीर्ष'],
    [/\bcircles?\b/gi, 'वृत्त'],
    [/\bradius\b/gi, 'त्रिज्या'],
    [/\bdiameter\b/gi, 'व्यास'],
    [/\btangents?\b/gi, 'स्पर्शरेखा'],
    [/\bsecants?\b/gi, 'छेदक रेखा'],
    [/\bparallel\b/gi, 'समांतर'],
    [/\bperpendicular\b/gi, 'लंबवत'],
    [/\bshaded region\b/gi, 'छायांकित क्षेत्र'],
    [/\bshaded area\b/gi, 'छायांकित भाग'],
    [/\bVenn diagrams?\b/gi, 'वेन आरेख'],
    [/\bhorizontal\b/gi, 'क्षैतिज'],
    [/\bvertical\b/gi, 'ऊर्ध्वाधर'],
    [/\bdegrees?\b/gi, 'अंश'],
    [/\bcentimeters?\b/gi, 'सेंटीमीटर'],
    [/\bmeters?\b/gi, 'मीटर'],
    [/\bwith\b/gi, 'जिसमें'],
    [/\band\b/gi, 'और'],
  ];

  for (const [rgx, rep] of wordMap) {
    s = s.replace(rgx, rep);
  }

  return s.replace(/\s+/g, ' ').trim();
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
    const rawNarration = ai.audioNarration?.trim() || '';
    const rawBreakdown = Array.isArray(ai.visualBreakdown) && ai.visualBreakdown.length > 0
      ? ai.visualBreakdown.join(' ')
      : '';
    const rawContext = ai.educationalContext?.trim() || '';

    if (isHindi) {
      const narrationHi = translateVisualDescriptionToHindi(rawNarration);
      const breakdownHi = Array.isArray(ai.visualBreakdown) && ai.visualBreakdown.length > 0
        ? ai.visualBreakdown.map((b, i) => `${i + 1}. ${translateVisualDescriptionToHindi(b)}`).join('। ')
        : '';
      const contextHi = translateVisualDescriptionToHindi(rawContext);

      const parts = [
        `प्रश्न ${qNum} के दृश्य आरेख (विजुअल डायग्राम) का विस्तृत विश्लेषण:`,
        narrationHi || 'आरेख में ज्यामितीय संरचना प्रदर्शित है।',
      ];
      if (breakdownHi) {
        parts.push(`दृश्य घटक: ${breakdownHi}।`);
      }
      if (contextHi) {
        parts.push(`शैक्षणिक संदर्भ: ${contextHi}।`);
      }
      return { title: `प्रश्न ${qNum} डायग्राम विश्लेषण`, speech: parts.join(' ') };
    } else {
      const speech = `Visual Diagram Breakdown for Question ${qNum}: ${rawNarration || rawBreakdown || 'The diagram illustrates the structural geometry and labeled elements for this problem.'} ${rawContext ? `Educational context: ${rawContext}` : ''}`;
      return { title: `Question ${qNum} Diagram Explanation`, speech };
    }
  }

  // 3. If it has diagramDescription
  if (question.diagramDescription) {
    if (isHindi) {
      const descHi = translateVisualDescriptionToHindi(question.diagramDescription);
      const speech = `प्रश्न ${qNum} के विजुअल आरेख का विवरण: ${descHi}। यह आरेख समस्या के मुख्य घटकों और ज्यामितीय संबंधों को दर्शाता है।`;
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
