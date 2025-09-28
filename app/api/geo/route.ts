import axios from 'axios';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await axios.get('https://ipapi.co/json/');
    return NextResponse.json({ country: res.data.country_name, city: res.data.city });
  } catch (err) {
    console.error('Geo API error:', err);
    return NextResponse.json({ country: null, city: null }, { status: 500 });
  }
}
