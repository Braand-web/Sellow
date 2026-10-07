"use client";

export function ProductSaleOptions({ price, compareAtPrice, saveForLaterEnabled, currency, onCompareAtPriceChange, onSaveForLaterChange }: {
  price: string; compareAtPrice: string; saveForLaterEnabled: boolean; currency: string;
  onCompareAtPriceChange: (value: string) => void; onSaveForLaterChange: (value: boolean) => void;
}) {
  return <div className="form-stack sale-options">
    <div className="field-group"><label htmlFor="compare-at-price">Prix barré (facultatif)</label>
      <input id="compare-at-price" className="field-input" type="number" min={Number(price) + (["XAF", "XOF"].includes(currency) ? 1 : 0.01)} step={["XAF", "XOF"].includes(currency) ? "1" : "0.01"} value={compareAtPrice} onChange={(event) => onCompareAtPriceChange(event.target.value)} placeholder="Sans prix barré" />
      <span className="field-help">Indiquez un prix de référence réel, supérieur au prix de vente. Seul le prix de vente est facturé.</span>
    </div>
    <label className="checkbox-line"><input type="checkbox" checked={saveForLaterEnabled} onChange={(event) => onSaveForLaterChange(event.target.checked)} /><span>Autoriser « Enregistrer pour plus tard »</span></label>
    <p className="field-help">Les favoris déjà enregistrés restent disponibles et peuvent être retirés.</p>
  </div>;
}
