Rails.application.routes.draw do
  # Devise authentication routes
  devise_for :users

  # Main application resources
  resources :posts do
    resources :comments, only: [:create, :destroy]
  end

  resources :users, only: [:index, :show]

  # API namespace
  namespace :api do
    namespace :v1 do
      resources :posts, only: [:index, :show, :create, :update, :destroy]
    end
  end

  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # PWA routes
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest

  # Root route
  root to: "pages#home"
end
