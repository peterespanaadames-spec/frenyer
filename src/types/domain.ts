export type Currency='USD'|'VES';
export type SaleStatus='Pagada'|'Pendiente'|'Anulada';
export interface Product{id:string;name:string;sku:string;category:string;priceUsd:number;stock:number;status:'Activo'|'Bajo stock'|'Agotado'}
export interface Customer{id:string;name:string;email:string;phone:string;balance:number;status:'Activo'|'Moroso'}
