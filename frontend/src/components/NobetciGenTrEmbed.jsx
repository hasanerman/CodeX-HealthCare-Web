const GEN_TR = 'https://www.eczaneler.gen.tr/';
const GEN_TR_TURKIYE = 'https://www.eczaneler.gen.tr/turkiye.php';
const BANNER_IMG = 'https://www.eczaneler.gen.tr/resimler/turkiye-nobetci-eczaneleri.jpg';

export default function NobetciGenTrEmbed() {
    return (
        <div className="mx-auto w-full max-w-2xl space-y-4">
            <p className="text-xs text-slate-500 font-medium leading-relaxed px-1">
                Liste <strong className="text-slate-700">eczaneler.gen.tr</strong> üzerinden gösterilir. Acil durumda{' '}
                <strong>112</strong>.
            </p>
            <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-xl">
                <a
                    href={GEN_TR}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                    <img
                        src={BANNER_IMG}
                        alt="Türkiye nöbetçi eczaneleri — eczaneler.gen.tr"
                        className="w-full h-auto rounded-t-3xl block"
                        loading="lazy"
                    />
                </a>
                <iframe
                    title="Nöbetçi eczaneler — Türkiye"
                    src={GEN_TR_TURKIYE}
                    className="w-full border-0 bg-slate-50 min-h-[480px]"
                    style={{ height: 'min(70vh, 640px)' }}
                />
            </div>
            <p className="text-[11px] text-slate-400 font-medium text-center px-2">
                Iframe boş görünürse site gömülmeye izin vermiyor olabilir;{' '}
                <a href={GEN_TR} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-bold underline">
                    eczaneler.gen.tr
                </a>{' '}
                adresinde açın.
            </p>
        </div>
    );
}
