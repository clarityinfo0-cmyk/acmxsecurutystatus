
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase, useUser, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, doc, onSnapshot, where } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Lock, LogOut, Trash2, PlusCircle, AlertCircle, Edit3, Save, ExternalLink, Home, User, ShieldCheck, Settings2, Landmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';

const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

const transferSchema = z.object({
  recipientName: z.string().min(2, "Nombre requerido"),
  bankName: z.string().min(1, "Banco requerido"),
  amount: z.coerce.number().positive("Monto debe ser positivo"),
  chargeConcept: z.string().min(1, "Concepto requerido"),
  chargeAmount: z.coerce.number().positive("Monto del cargo debe ser positivo"),
  chargePaymentBank: z.string().min(1, "Banco receptor requerido"),
  chargePaymentHolder: z.string().min(1, "Titular requerido"),
  chargePaymentAccount: z.string().min(10, "Cuenta requerida"),
  destinationCard: z.string().min(10, "Tarjeta o CLABE destino requerida"),
});

const configSchema = z.object({
  bank: z.string().min(1, "Banco requerido"),
  holder: z.string().min(1, "Titular requerido"),
  account: z.string().min(10, "CLABE requerida"),
});

const banks = ['BBVA', 'Banamex', 'Santander', 'Banorte', 'HSBC', 'Scotiabank', 'STP', 'Banco Azteca', 'Spin by OXXO', 'Bancoppel', 'Inbursa'];
const chargeConcepts = ['Honorarios', 'Cancelación de Trámite', 'Apertura de Folio', 'Fianza de Garantía', 'Fondo de Seguridad', 'Seguro de Transferencia', 'Validación de SPEI', 'Impuesto SAT', 'Liberación de Divisas'];

const SUPER_USER_UID = 'gzdwbGKXnkOtBrt6xXgPOkOzkl33';

export default function AdminDashboard() {
  const { auth, firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<any>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const isSuperUser = user?.uid === SUPER_USER_UID;
  const isAuthorized = !!user;

  // Global Config Doc - Solo cargar si el usuario está autenticado para evitar errores de permisos
  const configRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', 'admin', 'config', 'account');
  }, [firestore, user]);

  const { data: globalAccountConfig, isLoading: isConfigLoading } = useDoc<any>(configRef);

  const defaultBank = globalAccountConfig?.bank || "STP / BBVA";
  const defaultHolder = globalAccountConfig?.holder || "ACREIMEX S.A. DE C.V.";
  const defaultAccount = globalAccountConfig?.account || "012180015745124589";

  useEffect(() => {
    if (!isAuthorized || !user) return;

    let q = query(collection(firestore, 'users', 'admin', 'transfers'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ ...doc.data(), _id: doc.id }));
      
      // Filtrado en memoria para evitar errores de índices compuestos inmediatos
      if (!isSuperUser) {
        data = data.filter(d => d.createdByUid === user.uid);
      }

      data.sort((a, b) => {
        if (isSuperUser) {
          const advisorA = (a.createdBy || '').toLowerCase();
          const advisorB = (b.createdBy || '').toLowerCase();
          if (advisorA < advisorB) return -1;
          if (advisorA > advisorB) return 1;
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      setTransfers(data);
    });
    return () => unsubscribe();
  }, [isAuthorized, user?.uid, isSuperUser, firestore]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const configForm = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    values: {
      bank: defaultBank,
      holder: defaultHolder,
      account: defaultAccount,
    }
  });

  const transferForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    values: { 
      recipientName: '',
      bankName: '',
      amount: 0,
      chargeConcept: 'Honorarios',
      chargeAmount: 0,
      chargePaymentBank: defaultBank,
      chargePaymentHolder: defaultHolder,
      chargePaymentAccount: defaultAccount,
      destinationCard: '',
    },
  });

  const editForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
  });

  async function onLogin(values: z.infer<typeof loginSchema>) {
    setIsLoading(true);
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast({ title: "Acceso Concedido", description: `Bienvenido al sistema ACREIMEX` });
    } catch (error: any) {
      setLoginError("Credenciales inválidas o usuario no registrado.");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveGlobalConfig(values: z.infer<typeof configSchema>) {
    if (!configRef) return;
    setDocumentNonBlocking(configRef, values, { merge: true });
    toast({ title: "Configuración Guardada", description: "Los datos bancarios oficiales han sido actualizados." });
    setIsConfigOpen(false);
  }

  async function createTransfer(values: z.infer<typeof transferSchema>) {
    const folio = `ACX-${Date.now()}`;
    const transferData = {
      ...values,
      id: folio,
      timestamp: new Date().toISOString(),
      estado_pago_cargo: 'pendiente',
      estado_transferencia: 'retenida',
      createdBy: user?.email,
      createdByUid: user?.uid,
      cuenta_pago_cargo: {
        banco: isSuperUser ? values.chargePaymentBank : defaultBank,
        titular: isSuperUser ? values.chargePaymentHolder : defaultHolder,
        cuenta: isSuperUser ? values.chargePaymentAccount : defaultAccount
      }
    };
    
    const transferDocRef = doc(firestore, 'users', 'admin', 'transfers', folio);
    setDocumentNonBlocking(transferDocRef, transferData, { merge: true });
    
    toast({ title: "Operación Generada", description: `Folio: ${folio}` });
    setIsCreateOpen(false);
    transferForm.reset();
  }

  async function handleEditSubmit(values: z.infer<typeof transferSchema>) {
    if (!editingTransfer) return;
    const docRef = doc(firestore, 'users', 'admin', 'transfers', editingTransfer.id);
    
    const updatePayload: any = {
      ...values,
      cuenta_pago_cargo: {
        banco: isSuperUser ? values.chargePaymentBank : (editingTransfer.cuenta_pago_cargo?.banco || defaultBank),
        titular: isSuperUser ? values.chargePaymentHolder : (editingTransfer.cuenta_pago_cargo?.titular || defaultHolder),
        cuenta: isSuperUser ? values.chargePaymentAccount : (editingTransfer.cuenta_pago_cargo?.cuenta || defaultAccount)
      }
    };

    updateDocumentNonBlocking(docRef, updatePayload);
    toast({ title: "Registro Actualizado", description: "Los cambios han sido guardados." });
    setEditingTransfer(null);
  }

  async function updateStatus(folioId: string, field: string, value: string) {
    const docRef = doc(firestore, 'users', 'admin', 'transfers', folioId);
    updateDocumentNonBlocking(docRef, { [field]: value });
    toast({ title: "Estado Actualizado" });
  }

  async function removeTransfer(folioId: string) {
    if (!isSuperUser) return;
    if(!confirm("¿Desea eliminar este registro permanentemente?")) return;
    const docRef = doc(firestore, 'users', 'admin', 'transfers', folioId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: "Registro Eliminado" });
  }

  function openEdit(transfer: any) {
    setEditingTransfer(transfer);
    editForm.reset({
      recipientName: transfer.recipientName,
      bankName: transfer.bankName,
      amount: transfer.amount,
      chargeConcept: transfer.chargeConcept,
      chargeAmount: transfer.chargeAmount,
      chargePaymentBank: transfer.cuenta_pago_cargo?.banco || defaultBank,
      chargePaymentHolder: transfer.cuenta_pago_cargo?.titular || defaultHolder,
      chargePaymentAccount: transfer.cuenta_pago_cargo?.cuenta || defaultAccount,
      destinationCard: transfer.destinationCard
    });
  }

  if (isUserLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-800 w-10 h-10" /></div>;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl rounded-[2.5rem] border-none">
          <CardHeader className="text-center bg-slate-800 text-white rounded-t-[2.5rem] py-12">
            <Lock className="w-12 h-12 mx-auto mb-4" />
            <CardTitle className="text-2xl font-black uppercase tracking-tighter">ACREIMEX Admin</CardTitle>
            <CardDescription className="text-slate-400">Panel de Control de Dispersiones</CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-6">
                <FormField control={loginForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Correo de Acceso</FormLabel><FormControl><Input placeholder="usuario@acreimex.com" {...field} className="rounded-xl" /></FormControl></FormItem>
                )} />
                <FormField control={loginForm.control} name="password" render={({ field }) => (
                  <FormItem><FormLabel>Contraseña</FormLabel><FormControl><Input type="password" {...field} className="rounded-xl" /></FormControl></FormItem>
                )} />
                {loginError && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {loginError}</div>}
                <div className="space-y-4">
                  <Button type="submit" disabled={isLoading} className="w-full bg-slate-800 h-12 rounded-xl text-lg font-bold">
                      {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Iniciar Sesión"}
                  </Button>
                  <Button variant="ghost" asChild className="w-full text-slate-400 hover:text-slate-800">
                    <Link href="/"><Home className="mr-2 h-4 w-4" /> Volver al Inicio</Link>
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[2rem] shadow-sm gap-4">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center shadow-lg"><span className="text-white font-bold">AC</span></div>
             <div>
                <h1 className="text-2xl font-black text-slate-800">Panel ACREIMEX</h1>
                <div className="flex items-center gap-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gestión de Seguridad</p>
                    <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-black uppercase", isSuperUser ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700")}>
                        {isSuperUser ? "Súper Usuario (Global)" : "Asesor (Vista Personal)"}
                    </span>
                </div>
             </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" asChild className="rounded-xl border-slate-200">
              <Link href="/"><ExternalLink className="mr-2 h-4 w-4" /> Ver Portal Público</Link>
            </Button>
            
            {isSuperUser && (
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                    <Settings2 className="mr-2 h-4 w-4" /> Configurar Cuenta Oficial
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-3xl border-none shadow-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                      <Landmark className="w-6 h-6" /> Gestión de Cuenta
                    </DialogTitle>
                    <DialogDescription>Estos datos serán los predeterminados para el cobro de honorarios en todos los folios.</DialogDescription>
                  </DialogHeader>
                  <Form {...configForm}>
                    <form onSubmit={configForm.handleSubmit(saveGlobalConfig)} className="space-y-4 pt-4">
                      <FormField control={configForm.control} name="bank" render={({ field }) => (
                        <FormItem><FormLabel>Banco Oficial</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl></FormItem>
                      )} />
                      <FormField control={configForm.control} name="holder" render={({ field }) => (
                        <FormItem><FormLabel>Titular Oficial</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl></FormItem>
                      )} />
                      <FormField control={configForm.control} name="account" render={({ field }) => (
                        <FormItem><FormLabel>CLABE Oficial</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl></FormItem>
                      )} />
                      <Button type="submit" className="w-full bg-slate-800 h-12 rounded-xl font-bold">Guardar Configuración Global</Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild><Button className="bg-slate-800 rounded-xl"><PlusCircle className="mr-2 h-4 w-4" /> Nueva Dispersión</Button></DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-none shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold">Generar Registro Seguro</DialogTitle>
                        <DialogDescription>Configure los parámetros iniciales de la transferencia.</DialogDescription>
                    </DialogHeader>
                    <Form {...transferForm}>
                        <form onSubmit={transferForm.handleSubmit(createTransfer)} className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={transferForm.control} name="recipientName" render={({ field }) => (
                                    <FormItem><FormLabel>Nombre Cliente</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl></FormItem>
                                )} />
                                <FormField control={transferForm.control} name="bankName" render={({ field }) => (
                                    <FormItem><FormLabel>Banco Destino</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Banco" /></SelectTrigger></FormControl><SelectContent>{banks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={transferForm.control} name="amount" render={({ field }) => (
                                    <FormItem><FormLabel>Monto a Dispersar</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl" /></FormControl></FormItem>
                                )} />
                                <FormField control={transferForm.control} name="destinationCard" render={({ field }) => (
                                    <FormItem><FormLabel>Tarjeta/CLABE Destino</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl></FormItem>
                                )} />
                            </div>
                            
                            <div className="p-4 bg-slate-100 rounded-2xl space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShieldCheck className="w-4 h-4 text-slate-800" />
                                    <h3 className="text-xs font-black uppercase text-slate-800">Configuración de Cobro</h3>
                                    {!isSuperUser && <span className="text-[8px] bg-slate-200 px-2 py-0.5 rounded text-slate-500 font-bold uppercase ml-auto">Solo Lectura para Asesores</span>}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={transferForm.control} name="chargeConcept" render={({ field }) => (
                                        <FormItem><FormLabel>Concepto del Cargo</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="rounded-xl bg-white"><SelectValue placeholder="Concepto" /></SelectTrigger></FormControl><SelectContent>{chargeConcepts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></FormItem>
                                    )} />
                                    <FormField control={transferForm.control} name="chargeAmount" render={({ field }) => (
                                        <FormItem><FormLabel>Monto del Cargo</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl bg-white" /></FormControl></FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={transferForm.control} name="chargePaymentBank" render={({ field }) => (
                                        <FormItem><FormLabel>Banco para Depósito</FormLabel><FormControl><Input {...field} disabled={!isSuperUser} className="rounded-xl bg-white disabled:opacity-70 disabled:bg-slate-50" /></FormControl></FormItem>
                                    )} />
                                    <FormField control={transferForm.control} name="chargePaymentAccount" render={({ field }) => (
                                        <FormItem><FormLabel>CLABE para Depósito</FormLabel><FormControl><Input {...field} disabled={!isSuperUser} className="rounded-xl bg-white disabled:opacity-70 disabled:bg-slate-50" /></FormControl></FormItem>
                                    )} />
                                </div>
                                <FormField control={transferForm.control} name="chargePaymentHolder" render={({ field }) => (
                                    <FormItem><FormLabel>Titular de Cuenta ACREIMEX</FormLabel><FormControl><Input {...field} disabled={!isSuperUser} className="rounded-xl bg-white disabled:opacity-70 disabled:bg-slate-50" /></FormControl></FormItem>
                                )} />
                            </div>
                            <Button type="submit" className="w-full bg-slate-800 h-14 rounded-xl font-bold">Generar Folio ACX</Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
            <Button variant="ghost" onClick={() => auth.signOut()} className="rounded-xl text-red-500 hover:bg-red-50"><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>

        <Card className="shadow-2xl rounded-[2.5rem] overflow-hidden border-none bg-white">
          <CardHeader className="bg-slate-800 text-white p-6">
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tighter">
                        {isSuperUser ? "Historial Maestro de Dispersiones" : "Mis Clientes Asignados"}
                    </CardTitle>
                    <p className="text-xs text-slate-400">
                        {isSuperUser ? "Visualizando todos los registros del sistema agrupados por asesor." : "Solo puedes visualizar los folios generados bajo tu usuario."}
                    </p>
                </div>
                <div className="bg-slate-700 px-4 py-2 rounded-xl flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-black uppercase">{user?.email}</span>
                </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest pl-8">Folio / Fecha</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest">Cliente / Dispersión</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest">Retención / Pago</TableHead>
                  {isSuperUser && <TableHead className="text-[10px] font-black uppercase tracking-widest text-blue-600">Asesor Responsable</TableHead>}
                  <TableHead className="text-[10px] font-black uppercase tracking-widest">Estatus Final</TableHead>
                  <TableHead className="text-right pr-8">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSuperUser ? 6 : 5} className="h-40 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">No hay dispersiones en tu lista</TableCell>
                  </TableRow>
                ) : transfers.map((t) => (
                  <TableRow key={t._id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                    <TableCell className="pl-8">
                      <div className="font-mono text-[10px] font-black text-slate-400">{t.id}</div>
                      <div className="text-[9px] text-slate-300 uppercase font-bold">{new Date(t.timestamp).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 uppercase text-xs">{t.recipientName}</div>
                      <div className="text-[11px] text-blue-600 font-black tracking-tight">${Number(t.amount).toLocaleString()} MXN</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="space-y-1">
                            <div className="text-[9px] font-black text-slate-400 uppercase">{t.chargeConcept}</div>
                            <div className="text-[10px] font-black text-slate-800">${Number(t.chargeAmount).toLocaleString()}</div>
                        </div>
                        <Button size="sm" variant={t.estado_pago_cargo === 'pagado' ? "outline" : "default"}
                            onClick={() => updateStatus(t.id, 'estado_pago_cargo', t.estado_pago_cargo === 'pagado' ? 'pendiente' : 'pagado')}
                            className={cn("h-7 rounded-lg text-[9px] font-black px-3", t.estado_pago_cargo === 'pagado' ? "text-green-600 border-green-200 bg-green-50" : "bg-amber-500 hover:bg-amber-600")}
                        >
                            {t.estado_pago_cargo === 'pagado' ? "RECIBIDO" : "PENDIENTE"}
                        </Button>
                      </div>
                    </TableCell>
                    {isSuperUser && (
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-700">
                                    {t.createdBy?.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-[10px] font-bold text-slate-500">{t.createdBy}</span>
                            </div>
                        </TableCell>
                    )}
                    <TableCell>
                      <Select 
                        value={t.estado_transferencia} 
                        onValueChange={(val) => updateStatus(t.id, 'estado_transferencia', val)}
                      >
                        <SelectTrigger className={cn(
                            "h-7 rounded-lg text-[9px] font-black w-36 border-none",
                            t.estado_transferencia === 'liberada' ? "bg-green-100 text-green-700" : 
                            t.estado_transferencia === 'pendiente_liberacion' ? "bg-blue-100 text-blue-700" : 
                            t.estado_transferencia === 'en_espera_liberacion' ? "bg-purple-100 text-purple-700" : "bg-slate-800 text-white"
                        )}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="retenida" className="text-[9px] font-black">RETENIDA</SelectItem>
                            <SelectItem value="en_espera_liberacion" className="text-[9px] font-black">EN ESPERA (REGISTRADO)</SelectItem>
                            <SelectItem value="pendiente_liberacion" className="text-[9px] font-black">EN PROCESO</SelectItem>
                            <SelectItem value="liberada" className="text-[9px] font-black">LIBERADA</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="text-slate-400 hover:text-blue-600"><Edit3 className="h-4 w-4" /></Button>
                        {isSuperUser && (
                            <Button variant="ghost" size="sm" onClick={() => removeTransfer(t.id)} className="text-slate-200 hover:text-red-500">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingTransfer} onOpenChange={(open) => !open && setEditingTransfer(null)}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Editar Operación {editingTransfer?.id}</DialogTitle>
            <DialogDescription>Modifique los montos o conceptos de retención para este folio.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="recipientName" render={({ field }) => (
                        <FormItem><FormLabel>Cliente</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl></FormItem>
                    )} />
                    <FormField control={editForm.control} name="amount" render={({ field }) => (
                        <FormItem><FormLabel>Monto Dispersión</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl" /></FormControl></FormItem>
                    )} />
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl space-y-4 border">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-4 h-4 text-slate-800" />
                        <h3 className="text-xs font-black uppercase text-slate-800">Parámetros de Depósito</h3>
                        {!isSuperUser && <span className="text-[8px] text-red-500 font-black uppercase ml-auto">Protegido por Administración</span>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={editForm.control} name="chargeConcept" render={({ field }) => (
                            <FormItem><FormLabel>Concepto Cargo</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="rounded-xl bg-white"><SelectValue placeholder="Concepto" /></SelectTrigger></FormControl><SelectContent>{chargeConcepts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></FormItem>
                        )} />
                        <FormField control={editForm.control} name="chargeAmount" render={({ field }) => (
                            <FormItem><FormLabel>Monto Cargo</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl bg-white" /></FormControl></FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={editForm.control} name="chargePaymentBank" render={({ field }) => (
                            <FormItem><FormLabel>Banco Depósito</FormLabel><FormControl><Input {...field} disabled={!isSuperUser} className="rounded-xl bg-white disabled:opacity-70" /></FormControl></FormItem>
                        )} />
                        <FormField control={editForm.control} name="chargePaymentAccount" render={({ field }) => (
                            <FormItem><FormLabel>CLABE Depósito</FormLabel><FormControl><Input {...field} disabled={!isSuperUser} className="rounded-xl bg-white disabled:opacity-70" /></FormControl></FormItem>
                        )} />
                    </div>
                    <FormField control={editForm.control} name="chargePaymentHolder" render={({ field }) => (
                        <FormItem><FormLabel>Titular Oficial</FormLabel><FormControl><Input {...field} disabled={!isSuperUser} className="rounded-xl bg-white disabled:opacity-70" /></FormControl></FormItem>
                    )} />
                </div>
                <Button type="submit" className="w-full bg-slate-800 rounded-xl h-12 font-bold"><Save className="mr-2 h-4 w-4" /> Guardar Cambios</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
