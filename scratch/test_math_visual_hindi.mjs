import assert from 'node:assert';
import { verbalizeMath, verbalizeForSpeech } from '../src/utils/mathVerbalizer.js';
import { explainEquation, explainGraph, explainDiagram, parseQuadratic, translateVisualDescriptionToHindi } from '../src/utils/visualMathExplainer.js';

console.log('--- STARTING MATHEMATICAL & VISUAL HINDI EXPLANATION TESTS ---');

// Test 1: parseQuadratic
console.log('\n[Test 1] parseQuadratic: Standard quadratic parsing');
const q1 = parseQuadratic('2x^2 - 7x + 3 = 0');
assert(q1 !== null, 'q1 should parse');
assert.strictEqual(q1.a, 2);
assert.strictEqual(q1.b, -7);
assert.strictEqual(q1.c, 3);
assert.strictEqual(q1.discriminant, 25);
assert.strictEqual(q1.rootNature, 'real_distinct_rational');
assert.strictEqual(q1.roots?.root1, 3);
assert.strictEqual(q1.roots?.root2, 0.5);
assert.strictEqual(q1.opensUpward, true);
console.log('✓ parseQuadratic parsed 2x^2 - 7x + 3 = 0 correctly');

// Test 2: verbalizeMath in Hindi
console.log('\n[Test 2] verbalizeMath in Hindi');
const mathHi = verbalizeMath('2x^2 - 7x + 3 = 0', 'hi');
assert(mathHi.includes('का वर्ग') || mathHi.includes('स्क्वायर'), 'Should include Hindi power');
assert(mathHi.includes('ऋण') || mathHi.includes('माइनस'), 'Should include Hindi minus');
assert(mathHi.includes('धन') || mathHi.includes('प्लस'), 'Should include Hindi plus');
assert(mathHi.includes('बराबर'), 'Should include Hindi equals');
console.log('✓ verbalizeMath(..., "hi"):', mathHi);

// Test 3: explainEquation for Quadratic in Hindi (Practice Drill vs Exam)
console.log('\n[Test 3] explainEquation for Quadratic Equation in Hindi');
const eqExplPracticeHi = explainEquation('2x^2 - 7x + 3 = 0', true, { isPractice: true });
assert(eqExplPracticeHi.isQuadratic === true);
assert(eqExplPracticeHi.speech.includes('द्विघात समीकरण का विस्तृत विश्लेषण'));
assert(eqExplPracticeHi.speech.includes('विविक्तकर'));
assert(eqExplPracticeHi.speech.includes('25'));
assert(eqExplPracticeHi.speech.includes('परवलय'));
assert(eqExplPracticeHi.speech.includes('प्रैक्टिस ड्रिल सहायता'));
assert(eqExplPracticeHi.speech.includes('x₁ = 3'));
console.log('✓ explainEquation in Practice mode has roots & hints in Hindi');

const eqExplExamHi = explainEquation('2x^2 - 7x + 3 = 0', true, { isPractice: false });
assert(eqExplExamHi.isQuadratic === true);
assert(eqExplExamHi.speech.includes('हल करने की विधि'));
assert(!eqExplExamHi.speech.includes('प्रैक्टिस ड्रिल सहायता'));
console.log('✓ explainEquation in Timed Exam mode respects test integrity in Hindi');

// Test 4: explainEquation for General Formulas (Speed, Angles, Pythagoras, Circle) in Hindi
console.log('\n[Test 4] explainEquation for Specialized Mathematical Formulas in Hindi');
const speedHi = explainEquation('v = 72 \\text{ km/h} = 72 \\times \\frac{5}{18} = 20 \\text{ m/s}', true);
assert(speedHi.speech.includes('गति एवं चाल रूपांतरण'));
console.log('✓ Speed conversion formula explained in Hindi');

const angleHi = explainEquation('\\angle C = 180^\\circ - (60^\\circ + 30^\\circ) = 90^\\circ', true);
assert(angleHi.speech.includes('त्रिभुज के कोणों का ज्यामितीय विश्लेषण'));
console.log('✓ Triangle angle formula explained in Hindi');

const pythagorasHi = explainEquation('a^2 + b^2 = c^2 \\implies 5^2 + b^2 = 13^2', true);
assert(pythagorasHi.speech.includes('पाइथागोरस प्रमेय'));
console.log('✓ Pythagoras theorem explained in Hindi');

const circleHi = explainEquation('C = 2\\pi r = 2 \\times \\frac{22}{7} \\times 14', true);
assert(circleHi.speech.includes('वृत्त की परिधि'));
console.log('✓ Circle circumference formula explained in Hindi');

// Test 5: explainGraph in Hindi
console.log('\n[Test 5] explainGraph in Hindi');
const mockGraph = {
  type: 'bar',
  title: 'Annual Smartphone Sales',
  xAxisLabel: 'Fiscal Year',
  yAxisLabel: 'Sales Volume',
  unit: 'Million Units',
  data: [
    { id: 'p1', label: '2021', value: 100 },
    { id: 'p2', label: '2022', value: 150 },
    { id: 'p3', label: '2023', value: 200 }
  ]
};
const graphExplHi = explainGraph(mockGraph, true);
assert(graphExplHi.speech.includes('चार्ट और ग्राफ का विस्तृत विश्लेषण'));
assert(graphExplHi.speech.includes('बार चार्ट'));
assert(graphExplHi.speech.includes('उच्चतम मान'));
assert(graphExplHi.speech.includes('200'));
assert(graphExplHi.speech.includes('न्यूनतम मान'));
assert(graphExplHi.speech.includes('100'));
assert(graphExplHi.speech.includes('औसत'));
assert(graphExplHi.speech.includes('ऑडियो टोन'));
console.log('✓ explainGraph generates rich statistics, trend, and sonification instructions in Hindi');

// Test 6: translateVisualDescriptionToHindi & explainDiagram in Hindi
console.log('\n[Test 6] explainDiagram with Geometry in Hindi');
const mockDiagramQ = {
  questionNumber: 3,
  diagramType: 'geometry',
  diagramDescription: 'Geometry diagram of triangle ABC. Base AB measures 5.8 cm. Interior angle A at vertex A is 60°, angle B at vertex B is 30°. Vertex C is located at the top where sides AC and BC meet.',
  diagramAiExplanation: {
    diagramType: 'geometry',
    educationalContext: 'The diagram displays triangle ABC with base AB = 5.8 cm, Angle A = 60°, and Angle B = 30°. In Euclidean geometry, the sum of all three interior angles in any triangle is exactly 180°. Therefore, Angle C = 180° - (60° + 30°) = 90°, making triangle ABC a right-angled triangle at vertex C.',
    visualBreakdown: [
      'Horizontal baseline segment AB of length 5.8 cm running along the bottom',
      'Vertex A at bottom-left labeled with interior angle arc 60°',
      'Vertex B at bottom-right labeled with interior angle arc 30°',
      'Apex vertex C positioned above the baseline forming a 90° right angle'
    ],
    audioNarration: 'Visual geometry diagram: Triangle A B C. Base side A B is 5.8 centimeters long. Interior angle A measures 60 degrees. Interior angle B measures 30 degrees. The two sides AC and BC intersect at vertex C at the top, forming interior angle C.'
  }
};

const diagExplHi = explainDiagram(mockDiagramQ, true);
assert(diagExplHi.speech.includes('प्रश्न 3 के दृश्य आरेख'));
assert(diagExplHi.speech.includes('त्रिभुज'));
assert(diagExplHi.speech.includes('आधार भुजा'));
assert(diagExplHi.speech.includes('5.8 सेंटीमीटर'));
assert(diagExplHi.speech.includes('आंतरिक कोण'));
assert(diagExplHi.speech.includes('60 अंश'));
assert(diagExplHi.speech.includes('30 अंश'));
console.log('✓ explainDiagram produced accessible, complete Hindi visual description:', diagExplHi.speech.slice(0, 150) + '...');

console.log('\n--- ALL MATHEMATICAL & VISUAL HINDI TESTS PASSED SUCCESSFULLY! ---');
