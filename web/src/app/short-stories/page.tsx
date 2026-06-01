import { Metadata } from 'next';
import { buildCanonicalUrl } from '@/lib/url-helper';

const storyTitle = 'Let cross stitch remain for generations';
const canonicalUrl = buildCanonicalUrl('/short-stories');

export const metadata: Metadata = {
  title: `${storyTitle} | My thoughts`,
  description:
    'A personal cross-stitch short story about Eleanor and Lydia in Eldridge, reflecting on keeping hand embroidery alive for future generations.',
  keywords: [
    'cross-stitch short story',
    'cross-stitch reflections',
    'hand embroidery stories',
    'keep cross stitch alive',
    'Eldridge story',
    'grandmother granddaughter cross stitch',
  ],
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function ShortStories() {
  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-8 lg:p-10">
      <div className="prose max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-2xl border border-gray-200">
        <h1 className="text-3xl font-bold text-center text-gray-800">My thoughts</h1>

        <h2 className="text-2xl font-semibold mt-8 text-gray-700">{storyTitle}</h2>

        <p>
          This is the story of librarian Eleanor Thompson, who spent her entire life working as a librarian in the tiny town of Eldridge,
          far from the bustle of civilization. After sixty-five years of work, she finally retired and was able to pursue her passion:
          cross-stitching.
        </p>

        <p>
          Now, every evening at sunset, Eleanor would settle into a velvet chair by the window, carefully placing the wooden frame on her lap,
          as if it were a precious manuscript. She quietly embroidered to the sound of soft music, and time passed unnoticed...
        </p>

        <p>
          The pattern she chose that fall was simply delightful: a blooming rose garden, embroidered with crimson, emerald, and gold threads.
          She loved it! With precise movements, Eleanor moved the needle across the fabric, creating tiny crosses that gradually formed a
          pattern. This work became a kind of meditation for her, aided by her patience and perseverance, honed over a lifetime of cataloging
          thick volumes.
        </p>

        <p>
          One evening, when the work was almost complete, a light knock on the door interrupted her solitude. It was her granddaughter, Lydia,
          visiting from the big city. Young Lydia, a researcher in digital archives, looked at the embroidery with interest.
        </p>

        <p>
          &quot;Listen, Grandma, it&apos;s just like your library&mdash;every cross stitch in its place, creating a whole!&quot;
        </p>

        <p>Come to think of it, Lydia was right, don&apos;t you think?</p>

        <p>
          I just hope that cross stitch doesn&apos;t disappear like the paper books Eleanor worked with, giving way to the digital ones Lydia works
          with.
        </p>

        <p>
          That&apos;s my greatest hope.
        </p>
      </div>
    </div>
  );
}
