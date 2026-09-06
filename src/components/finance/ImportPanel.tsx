import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountRow } from "@/lib/finance/types";

type Props = {
  title?: string;
  ofxBusy: boolean;
  ofxMessage: string;
  ofxError: boolean;
  pdfBusy: boolean;
  pdfMessage: string;
  pdfError: boolean;
  pdfProgress?: number | null;
  accounts?: AccountRow[];
  selectedOfxAccountId?: string;
  creditCards?: AccountRow[];
  selectedPdfCardId?: string;
  classifying?: boolean;
  classifyStatus?: string;
  onOfxAccountChange?: (accountId: string) => void;
  onPdfCardChange?: (accountId: string) => void;
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
  pdfProgress = null,
  accounts = [],
  selectedOfxAccountId = "",
  creditCards = [],
  selectedPdfCardId = "",
  classifying,
  classifyStatus,
  onOfxAccountChange,
  onPdfCardChange,
  onOfxFile,
  onPdfFile,
  onClassify,
}: Props) {
  const ofxRequiresAccount = !!onOfxAccountChange;
  const ofxDisabled = ofxBusy || (ofxRequiresAccount && !selectedOfxAccountId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {onOfxAccountChange ? (
          <Select value={selectedOfxAccountId} onValueChange={onOfxAccountChange}>
            <SelectTrigger className="w-[240px]" aria-label="Conta ou cartão para OFX">
              <SelectValue placeholder="Conta/cartão do OFX" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button asChild disabled={ofxDisabled}>
          <label>
            {ofxBusy ? "Processando OFX…" : "Importar OFX"}
            <input
              type="file"
              accept=".ofx,.OFX"
              className="hidden"
              onChange={onOfxFile}
              disabled={ofxDisabled}
            />
          </label>
        </Button>
        {onPdfCardChange ? (
          <Select value={selectedPdfCardId} onValueChange={onPdfCardChange}>
            <SelectTrigger className="w-[220px]" aria-label="Cartão para fatura PDF">
              <SelectValue placeholder="Cartão da fatura" />
            </SelectTrigger>
            <SelectContent>
              {creditCards.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button asChild variant="secondary" disabled={pdfBusy}>
          <label>
            {pdfBusy ? "Processando PDF…" : "Importar fatura PDF"}
            <input
              type="file"
              accept=".pdf,.PDF"
              className="hidden"
              onChange={onPdfFile}
              disabled={pdfBusy || (onPdfCardChange && creditCards.length === 0)}
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
        {pdfBusy && pdfProgress != null ? (
          <div className="basis-full space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Processando fatura</span>
              <span className="tabular-nums">{Math.round(pdfProgress)}%</span>
            </div>
            <Progress value={pdfProgress} className="h-2" />
          </div>
        ) : null}
        {classifyStatus && <span className="text-sm text-muted-foreground">{classifyStatus}</span>}
      </CardContent>
    </Card>
  );
}
