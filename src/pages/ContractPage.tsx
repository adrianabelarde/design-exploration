import { useCallback, useEffect, useRef, useState } from 'react';
import { EtchASketch } from '../etch/EtchASketch';

/** Minimum drawn distance (px) before the scribble counts as a signature. */
const SIGNATURE_THRESHOLD_PX = 250;

export default function ContractPage() {
  const drawnRef = useRef(0);
  const [signed, setSigned] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    document.title = 'Etch Industries · Offer of Employment';
  }, []);

  const handleDraw = useCallback((d: number) => {
    drawnRef.current += d;
    if (drawnRef.current > SIGNATURE_THRESHOLD_PX) setSigned(true);
  }, []);

  const handleErase = useCallback(() => {
    drawnRef.current = 0;
    setSigned(false);
    setAccepted(false);
  }, []);

  return (
    <main className="stage">
      <article className="contract">
        <p className="contract-no">Employment Agreement No. 2026-001</p>
        <h1>Offer of Employment</h1>
        <p className="lede">
          This Employment Agreement (the &ldquo;Agreement&rdquo;) is made
          effective as of July 12, 2026, by and between Etch Industries, Inc.
          (the &ldquo;Company&rdquo;) and the undersigned
          (the &ldquo;Employee&rdquo;).
        </p>

        <ol className="clauses">
          <li>
            <strong>Position.</strong> The Company hereby employs the Employee
            as Chief Doodle Officer. The Employee accepts such employment and
            agrees to perform all doodling duties with reasonable skill, one
            stroke at a time.
          </li>
          <li>
            <strong>Compensation.</strong> The Employee shall be compensated
            in aluminum powder, payable upon every shake. No royalties,
            residuals, or undo functionality shall be provided.
          </li>
          <li>
            <strong>Work product.</strong> All work produced by the Employee
            remains attached to the Company&rsquo;s screen, and may be
            reclaimed by the powder at any time by means of vigorous shaking.
          </li>
          <li>
            <strong>Termination.</strong> Either party may terminate this
            Agreement by shaking the device, whereupon the signature below,
            this Agreement, and any feelings attached to either shall be void.
          </li>
        </ol>

        <p className="witness">
          In witness whereof, the parties have executed this Agreement as of
          the date first written above.
        </p>

        <div className="sig-head">
          <span>
            Signature of Employee <em aria-hidden="true">*</em>
          </span>
          <span>Date: July 12, 2026</span>
        </div>

        <div className="sig-field">
          <EtchASketch onDraw={handleDraw} onErase={handleErase} />
          {accepted && (
            <div className="stamp" aria-hidden="true">
              <div className="stamp-paper">HIRED</div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`execute${accepted ? ' is-done' : ''}`}
          disabled={!signed || accepted}
          onClick={() => setAccepted(true)}
        >
          {accepted
            ? 'Offer accepted ✓'
            : signed
              ? 'Accept Offer'
              : 'Sign above to accept'}
        </button>

        <p className="fine-print">
          This offer expires when shaken. Not legal advice. Compensation
          subject to static electricity.
        </p>
      </article>
    </main>
  );
}
