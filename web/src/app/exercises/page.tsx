import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exercises for Cross-Stitchers',
  description: 'Tips and stretches to prevent strain and injury while enjoying cross-stitching.',
};

export default function ExercisesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Exercises and Tips for Cross-Stitchers</h1>
      
      <p className="text-gray-700 mb-6">
        Cross-stitching is a rewarding activity, but prolonged sessions can lead to repetitive strain injuries affecting the hands, wrists, arms, shoulders, and eyes. Incorporating regular breaks, proper posture, and targeted stretches can help mitigate these risks. The following guidance is compiled from reliable sources on RSI prevention for needlework enthusiasts.
      </p>
      
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Key Tips to Avoid Injury</h2>
      <ul className="list-disc pl-6 text-gray-700 mb-6 space-y-2">
        <li><strong>Take Regular Breaks:</strong> Pause every hour for at least 5 minutes to rest your eyes, wrists, and posture. Follow the 15-15-15 rule: every 15 minutes, look at an object 15 feet away for 15 seconds. This reduces eye strain and prevents overuse injuries. <a href="https://lordlibidan.com/when-cross-stitch-is-bad-for-your-health/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></li>
        <li><strong>Use Short Thread Lengths:</strong> Limit threads to the length from your middle fingertip to your elbow. This minimizes arm and shoulder strain from excessive pulling. <a href="https://crossstitchacademy.com/cross-stitch-without-injury/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></li>
        <li><strong>Maintain Good Posture:</strong> Sit upright with lumbar support, avoiding slouching. Use a chair that supports your back, and consider a cross-stitch stand to reduce neck and shoulder tension. Change positions frequently to maintain circulation. <a href="https://lordlibidan.com/when-cross-stitch-is-bad-for-your-health/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></li>
        <li><strong>Ensure Proper Lighting:</strong> Use bright, natural-like lighting (e.g., daylight bulbs) to avoid squinting. Magnifiers can help with fine details, reducing eye fatigue. <a href="https://crossstitchacademy.com/cross-stitch-without-injury/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></li>
        <li><strong>Stay Hydrated and Move:</strong> Drink water during breaks to encourage movement. This helps with overall health and prevents prolonged immobility. <a href="https://lordlibidan.com/when-cross-stitch-is-bad-for-your-health/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></li>
        <li><strong>Use Supports if Needed:</strong> If wrist pain occurs, wear a brace for support during stitching. Consult a physician for persistent discomfort to avoid long-term damage. <a href="https://crossstitchacademy.com/cross-stitch-without-injury/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></li>
      </ul>
      
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Recommended Stretches for RSI Prevention</h2>
      <p className="text-gray-700 mb-4">
        Perform these stretches gently, 2-3 times daily, holding each for 10-30 seconds unless specified. Focus on the hands, wrists, and upper body. Dedicate 5-15 minutes per session.
      </p>
      
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-medium text-gray-800">1. Wrist Circles</h3>
          <p className="text-gray-700">Rotate your wrists clockwise and counterclockwise to maintain mobility. Perform 10 circles in each direction.</p>
        </div>
        
        <div>
          <h3 className="text-xl font-medium text-gray-800">2. Median Nerve Glide</h3>
          <p className="text-gray-700">Place your hand on a wall behind you with fingers spread. Straighten your elbow while turning your body and head away. Hold for 10-15 seconds; repeat 3-5 times per arm. <a href="https://primalphysicaltherapy.com/repetitive-strain-injury-stretching-exercises/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></p>
        </div>
        
        <div>
          <h3 className="text-xl font-medium text-gray-800">3. Ulnar Nerve Glide</h3>
          <p className="text-gray-700">Make an “OK” sign with your fingers and place your pinky on your jaw. Raise your elbow toward the sky, pausing briefly. Repeat 5-10 times per arm. <a href="https://primalphysicaltherapy.com/repetitive-strain-injury-stretching-exercises/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></p>
        </div>
        
        <div>
          <h3 className="text-xl font-medium text-gray-800">4. Finger Stretch</h3>
          <p className="text-gray-700">Place hands in a prayer position, press fingers together, and pull palms apart at the knuckles to form a tent. Hold for 20-30 seconds; repeat 3 times. <a href="https://primalphysicaltherapy.com/repetitive-strain-injury-stretching-exercises/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></p>
        </div>
        
        <div>
          <h3 className="text-xl font-medium text-gray-800">5. Twisted Finger Clasp with Wrist Rolls</h3>
          <p className="text-gray-700">Clasp hands with arms extended, one over the other. Roll wrists side to side, then bend elbows and pull hands through. Alternate sides; repeat 5 times. <a href="https://primalphysicaltherapy.com/repetitive-strain-injury-stretching-exercises/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">[Source]</a></p>
        </div>
      </div>
      
      <p className="text-gray-700 mt-6">
        For additional stretches targeting posture and the upper body, consider incorporating propped knee slides or crab-to-bridge movements as daily routines. Always consult a healthcare professional before starting new exercises, especially if you experience pain.
      </p>
    </div>
  );
}