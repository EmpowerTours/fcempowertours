import axios from 'axios';

export async function GET() {
  try {
    const res = await axios.get('https://ipapi.co/json/');
    return Response.json({ country: res.data.country_name, city: res.data.city });
  } catch (err) {
    console.error('Geo API error:', err);
    return Response.json({ country: null, city: null }, { status: 500 });
  }
}
