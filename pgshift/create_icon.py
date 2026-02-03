#!/usr/bin/env python3
import struct
import zlib

size = 512
pixels = []

for y in range(size):
    row = []
    for x in range(size):
        nx = (x - size/2) / (size/2)
        ny = (y - size/2) / (size/2)
        dist = (nx*nx + ny*ny) ** 0.5
        
        if dist < 0.85:
            gradient = y / size
            r, g, b, a = int(30 + gradient * 40), int(20 + gradient * 30), int(80 + gradient * 80), 255
            
            cy1, cy2 = -0.25, 0.25
            cyl_width, cyl_height, ellipse_h = 0.5, 0.25, 0.08
            
            in_top_cyl = abs(nx) < cyl_width and abs(ny - cy1) < cyl_height
            in_bot_cyl = abs(nx) < cyl_width and abs(ny - cy2) < cyl_height
            top_e1 = (nx/cyl_width)**2 + ((ny - cy1 + cyl_height)/ellipse_h)**2 < 1
            bot_e1 = (nx/cyl_width)**2 + ((ny - cy1 - cyl_height)/ellipse_h)**2 < 1
            top_e2 = (nx/cyl_width)**2 + ((ny - cy2 + cyl_height)/ellipse_h)**2 < 1
            bot_e2 = (nx/cyl_width)**2 + ((ny - cy2 - cyl_height)/ellipse_h)**2 < 1
            
            if in_top_cyl or top_e1 or bot_e1:
                shade = 1.0 - abs(nx) / cyl_width * 0.3
                r, g, b = int(40 * shade), int(180 * shade), int(100 * shade)
                if top_e1:
                    r, g, b = 60, 220, 130
                    
            if in_bot_cyl or top_e2 or bot_e2:
                shade = 1.0 - abs(nx) / cyl_width * 0.3
                r, g, b = int(60 * shade), int(140 * shade), int(220 * shade)
                if top_e2:
                    r, g, b = 80, 170, 255
            
            if abs(nx) < 0.08 and ny > cy1 + cyl_height + 0.05 and ny < cy2 - cyl_height - 0.05:
                r, g, b = 255, 100, 100
            
            arrow_tip_y = cy2 - cyl_height - 0.08
            if ny > arrow_tip_y - 0.08 and ny < arrow_tip_y + 0.05:
                arrow_w = 0.15 * (1 - (ny - arrow_tip_y + 0.08) / 0.13)
                if abs(nx) < arrow_w:
                    r, g, b = 255, 100, 100
        else:
            if dist < 0.9:
                af = (0.9 - dist) / 0.05
                r, g, b, a = int(100 * af), int(80 * af), int(180 * af), int(255 * af)
            else:
                r, g, b, a = 0, 0, 0, 0
        
        row.extend([r, g, b, a])
    pixels.append(bytes([0] + row))

raw = b''.join(pixels)

def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

with open('src-tauri/icons/icon.png', 'wb') as f:
    f.write(png)
print('Created 512x512 pgshift icon')
