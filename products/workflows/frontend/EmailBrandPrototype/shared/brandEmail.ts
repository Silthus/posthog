// PROTOTYPE (throwaway): the branded starter template, built by code from the Email brand (no AI).
import { BrandValues } from '../simulation'
import { logoDataUrl } from './logos'

export interface StarterEmailOptions {
    muted?: boolean
}

export function buildStarterEmailHtml(brand: BrandValues, { muted = false }: StarterEmailOptions = {}): string {
    const name = brand.name || 'Your company'
    const primary = muted ? '#9CA3AF' : brand.primaryColor
    const accent = muted ? '#D1D5DB' : brand.accentColor
    const text = muted ? '#6B7280' : brand.textColor
    const background = muted ? '#F3F4F6' : brand.backgroundColor
    const font = brand.fontFamily
    const logo = brand.logo
        ? `<img src="${logoDataUrl(brand.logo)}" alt="${name}" height="40" style="height:40px;max-width:200px;display:block;${muted ? 'filter:grayscale(1);opacity:.6' : ''}" />`
        : `<div style="font-family:${font};font-size:24px;font-weight:700;color:${primary};line-height:40px">${name}</div>`
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${background};border-radius:12px;overflow:hidden;font-family:${font};color:${text}">
<tr><td style="padding:28px 40px 8px 40px;border-top:6px solid ${accent}">${logo}</td></tr>
<tr><td style="padding:24px 40px 0 40px"><h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:700;color:${text}">Welcome to ${name}</h1></td></tr>
<tr><td style="padding:16px 40px 0 40px;font-size:16px;line-height:1.6">Hi {{ person.properties.first_name }},<br/><br/>Thanks for signing up. You are all set. Here is the one thing most people do first, and it takes about two minutes.</td></tr>
<tr><td style="padding:28px 40px 0 40px"><a href="#" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px">Get started</a></td></tr>
<tr><td style="padding:28px 40px 0 40px;font-size:16px;line-height:1.6">Questions? Reply to this email and a person will answer.<br/><br/>${brand.name ? `The ${name} team` : 'The team'}</td></tr>
<tr><td style="padding:32px 40px 28px 40px"><hr style="border:0;border-top:1px solid ${accent}33;margin:0 0 20px 0"/><p style="margin:0;font-size:12px;line-height:1.6;color:${text};opacity:.6">${name} · 123 Example Street, Example City<br/><a href="{{ unsubscribe_url }}" style="color:${primary}">Unsubscribe</a> · <a href="#" style="color:${primary}">Manage preferences</a></p></td></tr>
</table></td></tr></table></body></html>`
}
