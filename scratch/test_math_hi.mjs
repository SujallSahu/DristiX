export function verbalizeMath(latex, lang = 'en') {
  if (!latex) return '';

  let verbal = latex.trim();

  // Normalize common spacing
  verbal = verbal.replace(/\\quad|\\qquad|\\,|\\;/g, ' ');

  if (lang === 'hi') {
    // Angles & Geometry
    verbal = verbal.replace(/\\angle\s*([a-zA-Z0-9])/g, 'कोण $1');
    verbal = verbal.replace(/\\angle/g, 'कोण ');
    verbal = verbal.replace(/\\triangle\s*([a-zA-Z0-9]+)/g, 'त्रिभुज $1');
    verbal = verbal.replace(/\\triangle/g, 'त्रिभुज ');

    // Degrees
    verbal = verbal.replace(/([0-9]+(?:\.[0-9]+)?)\s*(?:\^\{\\circ\}|\^\\circ|\\circ|\^\{\\degree\}|\^\\degree|\\degree|[°\u00B0\u02DA\u2218])/g, '$1 अंश');
    verbal = verbal.replace(/(?:\^\{\\circ\}|\^\\circ|\\circ|\^\{\\degree\}|\^\\degree|\\degree|[°\u00B0\u02DA\u2218])/g, ' अंश');

    // Units
    verbal = verbal.replace(/\\text\{\s*km\/h\s*\}/gi, ' किलोमीटर प्रति घंटा');
    verbal = verbal.replace(/\\text\{\s*m\/s\s*\}/gi, ' मीटर प्रति सेकंड');
    verbal = verbal.replace(/\\text\{\s*seconds?\s*\}/gi, ' सेकंड');
    verbal = verbal.replace(/\\text\{\s*metres?\s*\}/gi, ' मीटर');
    verbal = verbal.replace(/\\text\{\s*meters?\s*\}/gi, ' मीटर');
    verbal = verbal.replace(/\\text\{\s*cm\s*\}/gi, ' सेंटीमीटर');
    verbal = verbal.replace(/\\text\{\s*SP\s*\}/gi, ' विक्रय मूल्य ');
    verbal = verbal.replace(/\\text\{\s*CP\s*\}/gi, ' क्रय मूल्य ');
    verbal = verbal.replace(/\\text\{([^}]+)\}/g, ' $1 ');

    // Fractions
    verbal = verbal.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 बटा $2)');

    // Roots
    verbal = verbal.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$2 का $1 मूल');
    verbal = verbal.replace(/\\sqrt\{([^}]+)\}/g, 'वर्गमूल $1');

    // Powers and exponents
    verbal = verbal.replace(/([a-zA-Z0-9()]+)\^2(?![0-9])/g, '$1 का वर्ग');
    verbal = verbal.replace(/([a-zA-Z0-9()]+)\^3(?![0-9])/g, '$1 का घन');
    verbal = verbal.replace(/([a-zA-Z0-9()]+)\^\{([^}]+)\}/g, '$1 की घात $2');
    verbal = verbal.replace(/([a-zA-Z0-9()]+)\^([0-9a-zA-Z])/g, '$1 की घात $2');

    // Subscripts
    verbal = verbal.replace(/([a-zA-Z0-9])_\{([^}]+)\}/g, '$1 सब $2');
    verbal = verbal.replace(/([a-zA-Z0-9])_([0-9a-zA-Z])/g, '$1 सब $2');

    // Implications and relations
    verbal = verbal.replace(/\\implies|\\Rightarrow/g, ' जिससे प्राप्त होता है कि ');
    verbal = verbal.replace(/\\iff|\\Leftrightarrow/g, ' यदि और केवल यदि ');
    verbal = verbal.replace(/\\to|\\rightarrow/g, ' अग्रसर ');

    verbal = verbal.replace(/\\le|\\leq/g, ' छोटा या बराबर ');
    verbal = verbal.replace(/\\ge|\\geq/g, ' बड़ा या बराबर ');
    verbal = verbal.replace(/\\neq|\\ne/g, ' बराबर नहीं ');
    verbal = verbal.replace(/\\approx/g, ' लगभग बराबर ');
    verbal = verbal.replace(/\\pm|±/g, ' धन या ऋण ');
    verbal = verbal.replace(/\\times|×/g, ' गुणा ');
    verbal = verbal.replace(/\\div|÷/g, ' भाग ');
    verbal = verbal.replace(/\\cdot/g, ' गुणा ');

    // Greek symbols
    verbal = verbal.replace(/\\pi/g, 'पाई');
    verbal = verbal.replace(/\\theta/g, 'थीटा');
    verbal = verbal.replace(/\\alpha/g, 'अल्फा');
    verbal = verbal.replace(/\\beta/g, 'बीटा');
    verbal = verbal.replace(/\\gamma/g, 'गामा');
    verbal = verbal.replace(/\\Delta|\\delta/g, 'डेल्टा');
    verbal = verbal.replace(/\\infty/g, 'अनंत');
    verbal = verbal.replace(/\\%/g, ' प्रतिशत');

    // Arithmetic
    verbal = verbal.replace(/=/g, ' बराबर ');
    verbal = verbal.replace(/\+/g, ' धन ');
    verbal = verbal.replace(/[-−]/g, ' ऋण ');

    verbal = verbal.replace(/\\/g, '');
    verbal = verbal.replace(/\s+/g, ' ').trim();
    return verbal;
  }

  // English fallback
  verbal = verbal.replace(/\\angle\s*([a-zA-Z0-9])/g, 'angle $1');
  verbal = verbal.replace(/\\angle/g, 'angle ');
  verbal = verbal.replace(/\\triangle\s*([a-zA-Z0-9]+)/g, 'triangle $1');
  verbal = verbal.replace(/\\triangle/g, 'triangle ');

  verbal = verbal.replace(/([0-9]+(?:\.[0-9]+)?)\s*(?:\^\{\\circ\}|\^\\circ|\\circ|\^\{\\degree\}|\^\\degree|\\degree|[°\u00B0\u02DA\u2218])/g, '$1 degrees');
  verbal = verbal.replace(/(?:\^\{\\circ\}|\^\\circ|\\circ|\^\{\\degree\}|\^\\degree|\\degree|[°\u00B0\u02DA\u2218])/g, ' degrees');

  verbal = verbal.replace(/\\text\{\s*km\/h\s*\}/gi, ' kilometers per hour');
  verbal = verbal.replace(/\\text\{\s*m\/s\s*\}/gi, ' meters per second');
  verbal = verbal.replace(/\\text\{\s*seconds?\s*\}/gi, ' seconds');
  verbal = verbal.replace(/\\text\{\s*metres?\s*\}/gi, ' meters');
  verbal = verbal.replace(/\\text\{\s*meters?\s*\}/gi, ' meters');
  verbal = verbal.replace(/\\text\{\s*cm\s*\}/gi, ' centimeters');
  verbal = verbal.replace(/\\text\{([^}]+)\}/g, '$1');

  verbal = verbal.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, 'fraction: $1 over $2, end fraction');

  verbal = verbal.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1th root of $2');
  verbal = verbal.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');

  verbal = verbal.replace(/([a-zA-Z0-9()]+)\^2(?![0-9])/g, '$1 squared');
  verbal = verbal.replace(/([a-zA-Z0-9()]+)\^3(?![0-9])/g, '$1 cubed');
  verbal = verbal.replace(/([a-zA-Z0-9()]+)\^\{([^}]+)\}/g, '$1 to the power of $2');
  verbal = verbal.replace(/([a-zA-Z0-9()]+)\^([0-9a-zA-Z])/g, '$1 to the power of $2');

  verbal = verbal.replace(/([a-zA-Z0-9])_\{([^}]+)\}/g, '$1 sub $2');
  verbal = verbal.replace(/([a-zA-Z0-9])_([0-9a-zA-Z])/g, '$1 sub $2');

  verbal = verbal.replace(/\\implies|\\Rightarrow/g, ' which implies that ');
  verbal = verbal.replace(/\\iff|\\Leftrightarrow/g, ' if and only if ');
  verbal = verbal.replace(/\\to|\\rightarrow/g, ' approaches ');

  verbal = verbal.replace(/\\le|\\leq/g, ' is less than or equal to ');
  verbal = verbal.replace(/\\ge|\\geq/g, ' is greater than or equal to ');
  verbal = verbal.replace(/\\neq|\\ne/g, ' is not equal to ');
  verbal = verbal.replace(/\\approx/g, ' is approximately equal to ');
  verbal = verbal.replace(/\\pm/g, ' plus or minus ');
  verbal = verbal.replace(/\\times/g, ' multiplied by ');
  verbal = verbal.replace(/\\div/g, ' divided by ');
  verbal = verbal.replace(/\\cdot/g, ' dot ');

  verbal = verbal.replace(/\\pi/g, 'pi');
  verbal = verbal.replace(/\\theta/g, 'theta');
  verbal = verbal.replace(/\\alpha/g, 'alpha');
  verbal = verbal.replace(/\\beta/g, 'beta');
  verbal = verbal.replace(/\\gamma/g, 'gamma');
  verbal = verbal.replace(/\\Delta|\\delta/g, 'delta');
  verbal = verbal.replace(/\\infty/g, 'infinity');
  verbal = verbal.replace(/\\degree|[°\u00B0\u02DA\u2218]/g, ' degrees');
  verbal = verbal.replace(/\\%/g, ' percent');

  verbal = verbal.replace(/=/g, ' equals ');
  verbal = verbal.replace(/\\pm|±/g, ' plus or minus ');
  verbal = verbal.replace(/\\mp|∓/g, ' minus or plus ');
  verbal = verbal.replace(/\\times|×/g, ' multiplied by ');
  verbal = verbal.replace(/\\div|÷/g, ' divided by ');
  verbal = verbal.replace(/\\cdot/g, ' dot ');
  verbal = verbal.replace(/\+/g, ' plus ');
  verbal = verbal.replace(/[-−]/g, ' minus ');

  verbal = verbal.replace(/\\/g, '');

  verbal = verbal.replace(/([0-9]+(?:\.[0-9]+)?)\s*\^?\s*circ\b/gi, '$1 degrees');
  verbal = verbal.replace(/\^?\bcirc\b/gi, ' degrees');

  return verbal.replace(/\s+/g, ' ').trim();
}

export function translateVisualDescriptionToHindi(text) {
  if (!text) return '';
  let hi = text.trim();

  // Common phrases
  hi = hi.replace(/Visual geometry diagram:?/gi, 'दृश्य ज्यामितीय आरेख:');
  hi = hi.replace(/AI Diagram Breakdown for Question (\d+)\.?:?/gi, 'प्रश्न $1 के दृश्य आरेख का AI विश्लेषण:');
  hi = hi.replace(/The diagram displays/gi, 'यह आरेख दर्शाता है');
  hi = hi.replace(/The diagram illustrates/gi, 'यह आरेख स्पष्ट करता है');
  hi = hi.replace(/In Euclidean geometry,/gi, 'यूक्लिडियन ज्यामिति में,');
  hi = hi.replace(/the sum of all three interior angles in any triangle is exactly 180°\.?/gi, 'किसी भी त्रिभुज के तीनों आंतरिक कोणों का योग 180 अंश होता है।');
  hi = hi.replace(/making triangle ([A-Za-z]+) a right-angled triangle at vertex ([A-Za-z]+)\.?/gi, 'जिससे त्रिभुज $1 शीर्ष $2 पर एक समकोण त्रिभुज बनता है।');

  // Shapes & Geometric terms
  hi = hi.replace(/\btriangles?\b/gi, 'त्रिभुज');
  hi = hi.replace(/\bright-angled triangle\b/gi, 'समकोण त्रिभुज');
  hi = hi.replace(/\bright angle\b/gi, 'समकोण');
  hi = hi.replace(/\bhypotenuse\b/gi, 'कर्ण');
  hi = hi.replace(/\bbase side\b/gi, 'आधार भुजा');
  hi = hi.replace(/\bbase\b/gi, 'आधार');
  hi = hi.replace(/\bheight\b/gi, 'ऊंचाई');
  hi = hi.replace(/\binterior angles?\b/gi, 'आंतरिक कोण');
  hi = hi.replace(/\bangles?\b/gi, 'कोण');
  hi = hi.replace(/\bvertices\b/gi, 'शीर्ष बिंदु');
  hi = hi.replace(/\bvertex\b/gi, 'शीर्ष');
  hi = hi.replace(/\bcircles?\b/gi, 'वृत्त');
  hi = hi.replace(/\bradius\b/gi, 'त्रिज्या');
  hi = hi.replace(/\bdiameter\b/gi, 'व्यास');
  hi = hi.replace(/\bchords?\b/gi, 'जीवा');
  hi = hi.replace(/\btangents?\b/gi, 'स्पर्शरेखा');
  hi = hi.replace(/\bsecants?\b/gi, 'छेदक रेखा');
  hi = hi.replace(/\bparallel\b/gi, 'समांतर');
  hi = hi.replace(/\bperpendicular\b/gi, 'लंबवत');
  hi = hi.replace(/\bshaded region\b/gi, 'छायांकित क्षेत्र');
  hi = hi.replace(/\bshaded area\b/gi, 'छायांकित भाग');
  hi = hi.replace(/\bVenn diagrams?\b/gi, 'वेन आरेख');
  hi = hi.replace(/\bquadrilaterals?\b/gi, 'चतुर्भुज');
  hi = hi.replace(/\brectangles?\b/gi, 'आयात');
  hi = hi.replace(/\bsquares?\b/gi, 'वर्ग');
  hi = hi.replace(/\bperimeters?\b/gi, 'परिमाप');
  hi = hi.replace(/\bcircumferences?\b/gi, 'परिधि');
  hi = hi.replace(/\bareas?\b/gi, 'क्षेत्रफल');
  hi = hi.replace(/\bhorizontal\b/gi, 'क्षैतिज');
  hi = hi.replace(/\bvertical\b/gi, 'ऊर्ध्वाधर');
  hi = hi.replace(/\bsegment\b/gi, 'रेखाखंड');
  hi = hi.replace(/\bintersect at\b/gi, 'आपस में मिलते हैं');
  hi = hi.replace(/\bintersect\b/gi, 'प्रतिच्छेद करते हैं');
  hi = hi.replace(/\bat the top\b/gi, 'शीर्ष पर');
  hi = hi.replace(/\bforming\b/gi, 'बनाते हुए');
  hi = hi.replace(/\bmeasures?\b/gi, 'माप');
  hi = hi.replace(/\blength\b/gi, 'लंबाई');
  hi = hi.replace(/\bdegrees?\b/gi, 'अंश');
  hi = hi.replace(/\bcentimeters?\b/gi, 'सेंटीमीटर');
  hi = hi.replace(/\bmeters?\b/gi, 'मीटर');

  hi = hi.replace(/\s+/g, ' ').trim();
  return hi;
}
