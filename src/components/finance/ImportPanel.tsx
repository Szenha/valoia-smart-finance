import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title?: string;
  ofxBusy: boolean;
  ofxMessage: string;
  ofxError: boolean;
  pdfBusy: boolean;
  pdfMessage: string;
  pdfError: boolean;
  classifying?: boolean;
  classifyStatus?: string;
  onOfxFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPdfFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClassify?: () => void;
};

export function ImportPanel({
  title = "Importar extrato",
  ofxBusy,
  ofxMessage,
  ofxError,
  pdfBusy,
  pdfMessage,
  pdfError,
  classifying,
  classifyStatus,
  onOfxFile,
  onPdfFile,
  onClassify,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button asChild disabled={ofxBusy}>
          <label>
            {ofxBusy ? "Processando OFX…" : "Importar OFX"}
            <input
              type="file"
              accept=".ofx,.OFX"
              className="hidden"
              onChange={onOfxFile}
              disabled={ofxBusy}
            />
          </label>
        </Button>
        <Button asChild variant="secondary" disabled={pdfBusy}>
          <label>
            {pdfBusy ? "Processando PDF…" : "Importar fatura PDF"}
            <input
              type="file"
              accept=".pdf,.PDF"
              className="hidden"
              onChange={onPdfFile}
              disabled={pdfBusy}
            />
          </label>
        </Button>
        {onClassify ? (
          <Button variant="outline" onClick={onClassify} disabled={classifying}>
            {classifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Classificar pendentes
          </Button>
        ) : null}
        {ofxMessage && (
          <span className={ofxError ? "text-sm text-red-700" : "text-sm text-emerald-700"}>
            {ofxMessage}
          </span>
        )}
        {pdfMessage && (
          <span className={pdfError ? "text-sm text-red-700" : "text-sm text-violet-700"}>
            {pdfMessage}
          </span>
        )}
        {classifyStatus && <span className="text-sm text-muted-foreground">{classifyStatus}</span>}
      </CardContent>
    </Card>
  );
}
