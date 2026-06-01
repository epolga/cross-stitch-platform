import { notFound } from 'next/navigation';
import DownloadPdfLink from '@/app/components/DownloadPdfLink';
import type { Design } from '@/app/types/design';

const smokeTestDesign: Design = {
  DesignID: 999999,
  AlbumID: 1,
  Caption: 'QA paid download smoke test',
  Description: 'Internal QA route for the paid download smoke test.',
  NColors: 1,
  NDownloaded: 0,
  Width: 1,
  Height: 1,
  Notes: '',
  Text: '',
  NPage: 1,
  ImageUrl: null,
  PdfUrl: '/qa/download-target',
  NGlobalPage: 1,
};

export default function PaidDownloadFlowQaPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Paid Download QA Flow</h1>
      <p className="mt-3 text-sm leading-6 text-gray-700">
        Internal QA route used by the Playwright smoke test. It renders the real paid-mode
        download link with a stable test PDF target.
      </p>
      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-base font-medium text-gray-900">{smokeTestDesign.Caption}</p>
        <div className="mt-4">
          <DownloadPdfLink
            design={smokeTestDesign}
            className="inline-block text-blue-700 text-base leading-tight underline cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
