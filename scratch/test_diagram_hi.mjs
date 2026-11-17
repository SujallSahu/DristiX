export function translateVisualDescriptionToHindi(text) {
  if (!text) return '';
  let s = text.trim();

  // Multi-word full phrases first
  const phraseMap = [
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
  const wordMap = [
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

const narration = 'Visual geometry diagram: Triangle A B C. Base side A B is 5.8 centimeters long. Interior angle A measures 60 degrees. Interior angle B measures 30 degrees. The two sides AC and BC intersect at vertex C at the top, forming interior angle C.';
const breakdown = [
  'Horizontal baseline segment AB of length 5.8 cm running along the bottom',
  'Vertex A at bottom-left labeled with interior angle arc 60°',
  'Vertex B at bottom-right labeled with interior angle arc 30°',
  'Apex vertex C positioned above the baseline forming a 90° right angle'
];

console.log('Narration in Hindi:');
console.log(translateVisualDescriptionToHindi(narration));
console.log('\nBreakdown in Hindi:');
breakdown.forEach((b, i) => console.log((i+1) + '. ' + translateVisualDescriptionToHindi(b)));
