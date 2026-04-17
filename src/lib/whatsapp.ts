/**
 * Formats a professional and pretty WhatsApp message for orders.
 */
export function formatOrderMessage(params: {
    storeName: string;
    productName: string;
    price: number | null;
    buyerName: string;
    storeUrl: string;
}) {
    const { storeName, productName, price, buyerName, storeUrl } = params;
    
    const priceStr = price !== null 
        ? `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
        : 'Combinar';
    
    // Using some emojis for a "pretty" look
    const text = `
✨ *NOVO PEDIDO NO iUser!* ✨
-----------------------------
📍 *Loja:* ${storeName}
👤 *Cliente:* ${buyerName}
🛍️ *Item:* ${productName}
💳 *Valor:* ${priceStr}
-----------------------------
🔗 *Acesse a vitrine:*
${storeUrl}

_Obrigado pelo seu pedido!_ 🚀
`.trim();

    return encodeURIComponent(text);
}

export function formatCartMessage(params: {
    storeName: string;
    items: { product: { name: string; price: number }; quantity: number }[];
    totalPrice: number;
    buyerName: string;
    storeUrl: string;
}) {
    const { storeName, items, totalPrice, buyerName, storeUrl } = params;
    
    const itemsList = items.map(item => 
        `• ${item.quantity}x ${item.product.name} (_R$ ${(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})_`
    ).join('\n');
    
    const text = `
✨ *NOVO PEDIDO NO Carrinho iUser!* ✨
-----------------------------
📍 *Loja:* ${storeName}
👤 *Cliente:* ${buyerName}

📦 *Itens do Carrinho:*
${itemsList}

💰 *TOTAL: R$ ${totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*
-----------------------------
🔗 *Acesse a vitrine:*
${storeUrl}

_Obrigado pelo seu pedido!_ 🚀
`.trim();

    return encodeURIComponent(text);
}

export function getWhatsAppLink(phone: string, message: string) {
    // Remove all non-digits
    const cleanPhone = phone.replace(/\D/g, '');
    // Ensure it has country code (BR: 55)
    const phoneWithCountry = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    
    return `https://wa.me/${phoneWithCountry}?text=${message}`;
}
