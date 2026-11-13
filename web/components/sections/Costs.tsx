import { useEffect, useId, useState } from 'react';
import type { Parcel, TaxReport } from '../../../shared/types.ts';
import { estimateCosts, type CostInputs } from '../../lib/costs.ts';
import { money } from '../../lib/format.ts';
import type { Loadable } from '../../lib/useReports.ts';
import { Block } from '../ui.tsx';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange(v: number): void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: string;
}

function NumberField({ label, value, onChange, prefix, suffix, step = 1, hint }: NumberFieldProps) {
  const id = useId();
  // Kept as text while typing so a half-entered number is not rewritten under the cursor.
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // Only an outside change to `value` should replace what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="input">
      <label htmlFor={id}>{label}</label>
      <div className="input-box">
        {prefix && <span>{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

interface CostsProps {
  parcel: Parcel;
  taxes: Loadable<TaxReport>;
  /** A price sent over from the Value tab; `nonce` changes on every request. */
  priceRequest: { price: number; nonce: number } | null;
}

export function Costs({ parcel, taxes, priceRequest }: CostsProps) {
  const market = parcel.marketValue ?? 0;
  const [input, setInput] = useState<CostInputs>({
    price: market,
    downPercent: 20,
    interestPercent: 7.5,
    termYears: 20,
    closingPercent: 3,
    taxableValue: market,
    taxRate: 0,
    otherAnnual: 0,
  });
  const [rateEdited, setRateEdited] = useState(false);
  const set = (patch: Partial<CostInputs>) => setInput((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (priceRequest) setInput((prev) => ({ ...prev, price: priceRequest.price }));
    // Keyed on the nonce so sending the same figure twice still applies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceRequest?.nonce]);

  // Adopt the looked-up tax rate when it arrives, unless the user already set their own.
  const lookedUp = taxes.status === 'ready' ? taxes.data.totalRate : null;
  useEffect(() => {
    if (lookedUp !== null && !rateEdited) setInput((prev) => ({ ...prev, taxRate: round(lookedUp, 6) }));
  }, [lookedUp, rateEdited]);

  const out = estimateCosts(input);
  const acreage = parcel.legalAcres ?? parcel.mappedAcres;

  return (
    <>
      <Block title="What it would take">
        <div className="totals">
          <div>
            <span className="totals-label">Cash to close</span>
            <span className="totals-value">{money(out.cashToClose)}</span>
          </div>
          <div>
            <span className="totals-label">Monthly carrying cost</span>
            <span className="totals-value">{money(out.monthlyCarry)}</span>
          </div>
        </div>
        <dl className="ledger">
          <div>
            <dt>Down payment</dt>
            <dd>{money(out.downPayment)}</dd>
          </div>
          <div>
            <dt>Closing costs</dt>
            <dd>{money(out.closingCosts)}</dd>
          </div>
          <div>
            <dt>Loan amount</dt>
            <dd>{money(out.loanAmount)}</dd>
          </div>
          <div>
            <dt>Loan payment, monthly</dt>
            <dd>{money(out.monthlyPayment)}</dd>
          </div>
          <div>
            <dt>Property tax, yearly</dt>
            <dd>{money(out.annualTax)}</dd>
          </div>
          <div>
            <dt>Interest over the loan</dt>
            <dd>{money(out.totalInterest)}</dd>
          </div>
          <div>
            <dt>Cash needed in year one</dt>
            <dd>{money(out.firstYearCash)}</dd>
          </div>
          {acreage && input.price > 0 ? (
            <div>
              <dt>Price per acre</dt>
              <dd>{money(input.price / acreage)}</dd>
            </div>
          ) : null}
        </dl>
      </Block>

      <Block title="Your assumptions">
        <div className="inputs">
          <NumberField
            label="Purchase price"
            prefix="$"
            step={1000}
            value={input.price}
            onChange={(price) => set({ price })}
            hint={market > 0 ? `The appraisal district's value is ${money(market)}. See the Value tab for other estimates.` : 'No roll value to start from.'}
          />
          <NumberField label="Down payment" suffix="%" value={input.downPercent} onChange={(downPercent) => set({ downPercent })} />
          <NumberField label="Interest rate" suffix="%" step={0.125} value={input.interestPercent} onChange={(interestPercent) => set({ interestPercent })} />
          <NumberField label="Loan term" suffix="yrs" value={input.termYears} onChange={(termYears) => set({ termYears })} />
          <NumberField
            label="Closing costs"
            suffix="%"
            step={0.25}
            value={input.closingPercent}
            onChange={(closingPercent) => set({ closingPercent })}
            hint="Title policy, survey, lender and recording fees."
          />
          <NumberField
            label="Taxable value"
            prefix="$"
            step={1000}
            value={input.taxableValue}
            onChange={(taxableValue) => set({ taxableValue })}
            hint="Lower this if the land keeps an agricultural or wildlife valuation."
          />
          <NumberField
            label="Tax rate per $100"
            prefix="$"
            step={0.01}
            value={input.taxRate}
            onChange={(taxRate) => {
              setRateEdited(true);
              set({ taxRate });
            }}
            hint={
              taxes.status === 'loading'
                ? 'Looking up local rates…'
                : lookedUp === null
                  ? 'Local rates could not be loaded; enter the combined rate.'
                  : rateEdited
                    ? `Looked-up rate was $${round(lookedUp, 6)}.`
                    : 'County, school and city rates. Add any special districts.'
            }
          />
          <NumberField
            label="Other yearly costs"
            prefix="$"
            step={100}
            value={input.otherAnnual}
            onChange={(otherAnnual) => set({ otherAnnual })}
            hint="Insurance, association dues, upkeep."
          />
        </div>
      </Block>

      <footer className="notes">
        <ul className="caveats">
          <li>A planning estimate from the assumptions above, not a loan quote or a tax bill. Land loans often carry higher rates and larger down payments than home mortgages.</li>
        </ul>
      </footer>
    </>
  );
}
