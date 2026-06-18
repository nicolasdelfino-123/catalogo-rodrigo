import { useEffect, useContext, useMemo, useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Context } from "../js/store/appContext.jsx";
import { storeConfig } from "../config/storeConfig.js";
import { formatCurrency } from "../utils/price.js";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

export default function ThankYou() {
    const { store, actions } = useContext(Context);
    const [orderReport, setOrderReport] = useState(null);

    const q = useQuery();
    const navigate = useNavigate();

    const status = q.get("status");
    // MP puede enviar el ID como payment_id o collection_id
    const paymentId = q.get("payment_id") || q.get("collection_id");
    const preferenceId = q.get("preference_id");
    const externalRef = q.get("external_reference");

    useEffect(() => {
        try {
            const savedReport = localStorage.getItem("mpOrderReport");
            if (savedReport) setOrderReport(JSON.parse(savedReport));
        } catch (error) {
            console.error("No se pudo leer el informe de Mercado Pago:", error);
        }
    }, []);

    const storeReportMessage = useMemo(() => {
        if (!orderReport) return "";

        const customer = orderReport.customer || {};
        const items = Array.isArray(orderReport.items) ? orderReport.items : [];
        const lines = [];

        lines.push("Hola! Compra por Mercado Pago aprobada.");
        lines.push("");
        lines.push("*Informe de compra*");
        lines.push(`Estado: ${status || "approved"}`);
        if (paymentId) lines.push(`ID de pago: ${paymentId}`);
        if (preferenceId) lines.push(`Preferencia: ${preferenceId}`);
        if (externalRef) lines.push(`Referencia: ${externalRef}`);
        lines.push("");
        lines.push("*Cliente*");
        lines.push(`Nombre: ${customer.name || "No informado"}`);
        lines.push(`Telefono: ${customer.phone || "No informado"}`);
        lines.push(`Email: ${customer.email || "No informado"}`);
        lines.push(`Zona / Localidad: ${customer.zone || "No informado"}`);
        lines.push("");
        lines.push("*Productos*");

        if (items.length === 0) {
            lines.push("No hay detalle de productos guardado.");
        } else {
            items.forEach((item) => {
                const size = item.selected_size_ml ? ` - ${item.selected_size_ml}ml` : "";
                const flavor = item.selected_flavor ? ` - ${item.selected_flavor}` : "";
                lines.push(`- ${item.quantity} x ${item.title}${flavor}${size}`);
                lines.push(`  ${formatCurrency(item.unit_price)} c/u - Subtotal: ${formatCurrency(item.subtotal)}`);
            });
        }

        lines.push("");
        if (orderReport.coupon) {
            lines.push(`Cupon: ${orderReport.coupon.code} (${orderReport.coupon.percent}% OFF)`);
            lines.push(`Descuento: ${formatCurrency(orderReport.coupon.discount)}`);
        }
        lines.push(`Total pagado: ${formatCurrency(orderReport.total || 0)}`);
        lines.push("");
        lines.push("Pedido pendiente de preparacion.");

        return lines.join("\n");
    }, [orderReport, status, paymentId, preferenceId, externalRef]);

    const sendStoreReport = () => {
        if (!storeReportMessage) {
            alert("No encontramos el detalle del carrito para enviar el informe.");
            return;
        }

        const phone = storeConfig.contact.whatsapp;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(storeReportMessage)}`;
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) window.location.href = url;
    };

    useEffect(() => {
        const init = async () => {
            console.log("📦 [THANKYOU] Cargando productos...");
            await actions.fetchProducts?.();
            // ❌ REMOVIDO: Ya no llamamos hydrateCart() acá
            // El carrito ya está hidratado desde Layout.jsx
        };
        init();
    }, []); // ← Dependencias vacías, solo se ejecuta una vez al montar

    useEffect(() => {
        if (!status) {
            console.log("⏭️ [THANKYOU] Sin status de pago, saltando lógica de checkout");
            return;
        }

        // ✅ Rehidratar carrito si el pago falló o fue cancelado
        if (status === "failure" || status === "rejected" || status === "cancelled") {
            console.log("🛒 Rehidratando carrito tras pago fallido...");
            actions.hydrateCart?.();
            return;
        }




        const handlePaymentSuccess = async () => {
            if (status !== "approved") return;

            console.log("✅ Pago aprobado - procesando...");
            console.log("💳 Payment ID:", paymentId);

            // Asegura que el pedido quede guardado aunque el webhook de MP no llegue en local/ngrok.
            if (paymentId) {
                try {
                    const syncResponse = await fetch(
                        `${import.meta.env.VITE_BACKEND_URL}/api/mercadopago/sync-payment/${paymentId}`,
                        { method: "POST" }
                    );
                    const syncData = await syncResponse.json().catch(() => ({}));

                    if (!syncResponse.ok) {
                        console.error("⚠️ No se pudo sincronizar la orden:", syncData);
                    } else {
                        console.log("✅ Orden sincronizada:", syncData);
                    }
                } catch (err) {
                    console.error("❌ Error sincronizando orden:", err);
                }
            }

            // 1) Vaciar carrito con la nueva función
            await actions.resetCartAfterPayment();
            await new Promise(r => setTimeout(r, 200));


            // 🔍 Ahora sí log después de limpiar
            console.log("🟢 [THANKYOU] Después de clearCart:");
            console.log("   - store.cart:", store.cart);
            console.log("   - localStorage cart:", localStorage.getItem("cart"));

            // 2) Esperar un poco a que el webhook cree la orden
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 3) Auto-login con reintentos (solo si NO hay usuario en sesión)
            if (!store.user && paymentId) {
                const maxRetries = 5;   // 5 intentos
                const delayMs = 1500;   // cada 1.5s
                let ok = false;

                for (let i = 0; i < maxRetries && !ok; i++) {
                    try {
                        console.log(`🔐 Auto-login intento ${i + 1}/${maxRetries} con payment_id: ${paymentId}`);
                        const response = await fetch(
                            `${import.meta.env.VITE_BACKEND_URL}/api/mercadopago/auto-login/${paymentId}`,
                            { method: 'POST' }
                        );

                        if (response.ok) {
                            const data = await response.json();
                            localStorage.setItem("token", data.token);
                            localStorage.setItem('needs_password_reset', 'true'); // 👈 MOVIDO ACÁ
                            console.log("✅ Auto-login exitoso + flag password reset");
                            ok = true;

                            if (actions.hydrateSession) {
                                await actions.hydrateSession();
                            }
                        } else {
                            const error = await response.json().catch(() => ({}));
                            console.log("⚠️ Auto-login falló:", error);
                            await new Promise(r => setTimeout(r, delayMs));
                        }
                    } catch (err) {
                        console.error("❌ Error en auto-login:", err);
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                }
            } else {
                console.log("ℹ️ Usuario ya logueado, se omite auto-login");
            }

            // 4) Recargar órdenes
            if (actions.fetchOrders) {
                await actions.fetchOrders();
            }

            console.log("✅ Proceso completado");
        };

        handlePaymentSuccess();
    }, [status, paymentId, actions]);

    return (
        <div className="max-w-2xl mx-auto px-4 py-14 text-center">
            {status === "approved" ? (
                <>
                    <div className="text-5xl mb-4">✅</div>
                    <h1 className="text-3xl font-bold mb-2">¡Gracias por tu compra!</h1>
                    <p className="text-gray-600 mb-6">
                        Tu pago fue acreditado correctamente.
                    </p>
                    <div className="bg-white border rounded-xl p-5 text-left mb-8">
                        <h2 className="font-semibold mb-2">Resumen</h2>
                        <ul className="text-sm text-gray-700 space-y-1">
                            <li><span className="font-medium">Estado:</span> {status}</li>
                            {paymentId && <li><span className="font-medium">ID de pago:</span> {paymentId}</li>}
                            {preferenceId && <li><span className="font-medium">Preferencia:</span> {preferenceId}</li>}
                            {externalRef && <li><span className="font-medium">Referencia:</span> {externalRef}</li>}
                        </ul>
                        <p className="text-xs text-gray-500 mt-3">
                            Enviá el informe a la tienda para que preparen tu compra.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={sendStoreReport}
                            className="px-4 py-2 rounded-md bg-[#25d366] text-white hover:bg-[#1ebe5d] font-semibold text-sm"
                        >
                            Enviar informe de compra a la tienda
                        </button>
                        <button
                            onClick={() => navigate("/inicio")}
                            className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50 text-sm"
                        >
                            Volver a Zahra Decants
                        </button>
                    </div>
                </>
            ) : status === "pending" ? (
                <>
                    <div className="text-5xl mb-4">⏳</div>
                    <h1 className="text-3xl font-bold mb-2">Pago pendiente</h1>
                    <p className="text-gray-600 mb-6">
                        Cuando se acredite, vas a ver el pedido en tu cuenta.
                    </p>
                    <Link to="/inicio" className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm">
                        Volver a Zahra Decants
                    </Link>
                </>
            ) : (
                <>
                    <div className="text-5xl mb-4">❌</div>
                    <h1 className="text-3xl font-bold mb-2">Pago fallido</h1>
                    <p className="text-gray-600 mb-6">
                        Algo salió mal. Podés intentar nuevamente.
                    </p>
                    <Link to="/inicio" className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 text-sm">
                        Volver a Zahra Decants
                    </Link>
                </>
            )}
        </div>
    );
}
