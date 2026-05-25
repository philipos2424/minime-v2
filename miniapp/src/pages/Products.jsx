import React, { useState, useEffect } from 'react'
import { Plus, Search, Edit2, Trash2, Image, Tag } from 'lucide-react'
import '../styles/Products.css'

function Products() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = 'active'
  const [searchQuery, setSearchQuery] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProducts()
  }, [status])

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('minime_token')
      const response = await fetch('/miniapp/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ 
          userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id,
          status,
          page: 1,
          limit: 50
        })
      })

      const data = await response.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('Products fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateProduct = async (productId, updates) => {
    try {
      const token = localStorage.getItem('minime_token')
      const response = await fetch('/miniapp/products/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ 
          userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id,
          productId,
          updates
        })
      })

      const data = await response.json()
      if (data.success) {
        setProducts(prev => 
          prev.map(p => p.id === productId ? { ...p, ...updates } : p)
        )
        setEditingProduct(null)
      }
    } catch (error) {
      console.error('Update error:', error)
    }
  }

  const filteredProducts = products.filter(p => {
    if (searchQuery) {
      return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="products">
      <h1 className="page-title">Products</h1>

      <div className="products-header">
        <div className="search-bar">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="status-tabs">
          <button className={status === 'active' ? 'active' : ''} onClick={() => setStatus('active')}>
            Active
          </button>
          <button className={status === 'pending_review' ? 'active' : ''} onClick={() => setStatus('pending_review')}>
            Pending
          </button>
          <button className={status === 'sold_out' ? 'active' : ''} onClick={() => setStatus('sold_out')}>
            Sold Out
          </button>
        </div>
      </div>

      <div className="products-grid">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Image size={40} />
            <p>No products yet</p>
            <span>Add products by sending photos to the bot</span>
          </div>
        ) : (
          filteredProducts.map(product => (
            <div key={product.id} className="product-card">
              <div className="product-image">
                {product.file_url ? (
                  <img src={product.file_url} alt={product.name} />
                ) : (
                  <div className="placeholder-image">
                    <Image size={32} />
                  </div>
                )}
                <div className="product-status">{product.status}</div>
              </div>

              <div className="product-info">
                <h3>{product.name || 'Unnamed Product'}</h3>
                <p className="product-price">
                  {product.price ? `${product.price} ETB` : 'Price not set'}
                </p>
                <p className="product-description">
                  {product.description?.substring(0, 100) || 'No description'}
                </p>

                {product.tags && product.tags.length > 0 && (
                  <div className="product-tags">
                    {product.tags.map(tag => (
                      <span key={tag} className="tag">
                        <Tag size={12} />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-actions">
                <button 
                  className="action-btn edit"
                  onClick={() => setEditingProduct(product)}
                >
                  <Edit2 size={16} />
                </button>
                <button className="action-btn delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingProduct && (
        <div className="modal-overlay" onClick={() => setEditingProduct(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Product</h3>
            <div className="form-group">
              <label>Name</label>
              <input 
                type="text" 
                defaultValue={editingProduct.name}
                id="edit-name"
              />
            </div>
            <div className="form-group">
              <label>Price (ETB)</label>
              <input 
                type="number" 
                defaultValue={editingProduct.price}
                id="edit-price"
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea 
                defaultValue={editingProduct.description}
                id="edit-description"
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button 
                className="btn-secondary"
                onClick={() => setEditingProduct(null)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={() => {
                  const updates = {
                    name: document.getElementById('edit-name').value,
                    price: parseFloat(document.getElementById('edit-price').value),
                    description: document.getElementById('edit-description').value
                  }
                  updateProduct(editingProduct.id, updates)
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Products