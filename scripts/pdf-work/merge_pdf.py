#!/usr/bin/env python3
# merge_pdf.py — insert cover as page 0, normalize to A4, write final PDF
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.5 or abs(h - A4_H) > 0.5:
        page.scale_to(A4_W, A4_H)
    return page

def main():
    cover_pdf = '/home/z/my-project/scripts/pdf-work/cover.pdf'
    body_pdf = '/home/z/my-project/scripts/pdf-work/body.pdf'
    output_pdf = '/home/z/my-project/download/ACQUISITIONOS-LOCAL-SETUP.pdf'
    writer = PdfWriter()
    writer.add_page(normalize_page_to_a4(PdfReader(cover_pdf).pages[0]))
    for page in PdfReader(body_pdf).pages:
        writer.add_page(normalize_page_to_a4(page))
    writer.add_metadata({
        '/Title': 'AcquisitionOS - Local Setup and Deployment Guide',
        '/Author': 'Z.ai',
        '/Creator': 'Z.ai',
        '/Subject': 'Verified zero-to-local setup, environment and deployment documentation',
    })
    with open(output_pdf, 'wb') as f:
        writer.write(f)
    print('final:', output_pdf, 'pages:', len(writer.pages))

if __name__ == '__main__':
    main()
