import { ManualEntryForm } from '../components/ManualEntry.tsx';
import { DbViewer, OcrBench } from '../components/debug.tsx';

export default function DebugPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Debug</h1>
      <p className="muted">Inspect OCR per value, browse raw device data, or enter scores by hand.</p>
      <OcrBench />
      <DbViewer />
      <ManualEntryForm />
    </div>
  );
}
