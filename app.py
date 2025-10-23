from flask import Flask, render_template, request, jsonify, send_file
import os
import json
import base64
from datetime import datetime
import mysql.connector
from mysql.connector import Error

app = Flask(__name__)

# -------------------------------
# Configuration
# -------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FAV_DIR = os.path.join(BASE_DIR, "saved_favorites")
PREVIEW_DIR = os.path.join(FAV_DIR, "previews")

# -------------------------------
# Database Configuration
# -------------------------------
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',  # Replace with your MySQL password
    'database': 'RE3Dmysqldb'   # Replace with your database name
}

def test_mysql_connection():
    """Test MySQL database connection and print status."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            db_info = connection.get_server_info()
            print(f"✅ Successfully connected to MySQL Server version {db_info}")
            cursor = connection.cursor()
            cursor.execute("SELECT DATABASE();")
            record = cursor.fetchone()
            print(f"✅ Connected to database: {record[0]}")
            cursor.close()
            connection.close()
            return True
        else:
            print("❌ Failed to connect to MySQL")
            return False
    except Error as e:
        print(f"❌ Error connecting to MySQL: {e}")
        return False

os.makedirs(FAV_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

test_mysql_connection()


# -------------------------------
# Routes
# -------------------------------
@app.route('/')
def index():
    """Serve the main webpage."""
    return render_template('index.html')


# -------------------------------
# STL Export Route
# -------------------------------
@app.route('/export_stl', methods=['POST'])
def export_stl():
    """Export the current model as an STL file."""
    data = request.json
    stl_base64 = data.get('stlData')

    if not stl_base64:
        return jsonify({'error': 'No STL data provided'}), 400

    # Decode the base64 STL data
    stl_bytes = base64.b64decode(stl_base64.split(',')[1])
    filename = f"vase_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.stl"
    filepath = os.path.join("static", filename)

    with open(filepath, 'wb') as f:
        f.write(stl_bytes)

    return jsonify({'download_url': f'/static/{filename}'})


# -------------------------------
# STL Upload Route
# -------------------------------
@app.route('/upload_stl', methods=['POST'])
def upload_stl():
    """Upload an STL file to preview/deform."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filename = file.filename
    filepath = os.path.join("static", filename)
    file.save(filepath)

    return jsonify({'file_url': f'/static/{filename}'})


# -------------------------------
# Save Favorite Route
# -------------------------------
@app.route('/save_favorite', methods=['POST'])
def save_favorite():
    """Save a vase preset and its preview image."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid JSON data'}), 400

    preview_data = data.pop('preview', None)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"favorite_{timestamp}.json"
    filepath = os.path.join(FAV_DIR, filename)

    # Save preview image if provided
    if preview_data:
        preview_filename = f"preview_{timestamp}.png"
        preview_path = os.path.join(PREVIEW_DIR, preview_filename)
        try:
            with open(preview_path, "wb") as img_file:
                img_file.write(base64.b64decode(preview_data.split(",")[1]))
            data["preview"] = f"/saved_favorites/previews/{preview_filename}"
        except Exception as e:
            print("Preview save failed:", e)
            data["preview"] = None

    # Save JSON data
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

    return jsonify({'message': 'Favorite saved successfully ✅'})


# -------------------------------
# Get All Favorites
# -------------------------------
@app.route('/get_favorites', methods=['GET'])
def get_favorites():
    """Return all saved favorites."""
    favorites = []
    for file in os.listdir(FAV_DIR):
        if file.endswith('.json'):
            with open(os.path.join(FAV_DIR, file), 'r') as f:
                fav = json.load(f)
                fav['filename'] = file
                favorites.append(fav)
    return jsonify(favorites)


# -------------------------------
# Delete Favorite
# -------------------------------
@app.route('/delete_favorite/<filename>', methods=['DELETE'])
def delete_favorite(filename):
    """Delete a favorite vase preset and its preview."""
    file_path = os.path.join(FAV_DIR, filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    with open(file_path, 'r') as f:
        fav_data = json.load(f)
    preview_path = fav_data.get('preview')

    os.remove(file_path)
    if preview_path:
        abs_preview = os.path.join(BASE_DIR, preview_path.lstrip('/'))
        if os.path.exists(abs_preview):
            os.remove(abs_preview)

    return jsonify({'message': 'Favorite deleted successfully 🗑️'})


# -------------------------------
# Main
# -------------------------------
if __name__ == '__main__':
    app.run(debug=True)
